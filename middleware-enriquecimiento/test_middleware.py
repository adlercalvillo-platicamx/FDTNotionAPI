import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

try:
    import requests  # noqa: F401
except ModuleNotFoundError:
    requests_stub = types.ModuleType("requests")
    requests_stub.HTTPError = RuntimeError
    sys.modules["requests"] = requests_stub

from notion_platica_middleware import Config, Middleware


def config(**overrides):
    values = {
        "notion_token": "notion-test",
        "contactos_data_source_id": "contactos",
        "citas_data_source_id": "citas",
        "contacto_bloqueo_agenda_id": "bloqueo",
        "platica_api_key": "platica-test",
        "platica_agent_id": "agente",
        "contactos_habilitado": True,
        "matches_habilitado": True,
        "use_delay": False,
    }
    values.update(overrides)
    return Config(**values)


def text_prop(value, prop_type="rich_text"):
    return {
        "type": prop_type,
        prop_type: [{"plain_text": value}],
    }


def rollup_text(value):
    return {
        "type": "rollup",
        "rollup": {
            "type": "array",
            "array": [text_prop(value)],
        },
    }


def match_row(
    row_id,
    *,
    state="",
    attempts=0,
    started_at="",
    assistant_id="asistente",
    sponsor_id="sponsor",
):
    return {
        "id": row_id,
        "created_time": f"2026-09-23T00:00:0{row_id[-1:] or '0'}Z",
        "properties": {
            "Nombre": text_prop("Sponsor × Asistente", "title"),
            "Contacto Match": {
                "type": "relation",
                "relation": [{"id": sponsor_id}],
            },
            "Contacto Principal": {
                "type": "relation",
                "relation": [{"id": assistant_id}],
            },
            "Empresa Sponsor": rollup_text("Sponsor SA"),
            "Empresa (asistente)": rollup_text("Asistente SA"),
            "Estado Enriquecimiento Match": {
                "type": "select",
                "select": {"name": state} if state else None,
            },
            "Intentos Enriquecimiento Match": {
                "type": "number",
                "number": attempts,
            },
            "Fecha Enriquecimiento Match": {
                "type": "date",
                "date": {"start": started_at} if started_at else None,
            },
        },
    }


class ConfigCompatibilityTests(unittest.TestCase):
    def test_legacy_contact_environment_still_starts_with_matches_off(self):
        legacy_env = {
            "NOTION_TOKEN": "notion",
            "NOTION_DATABASE_ID": "contactos-legacy",
            "PLATICA_API_KEY": "platica",
            "PLATICA_AGENT_ID": "agente",
            "MAX_PER_CYCLE": "7",
            "BACKFILL_GUARD_MAX": "22",
            "SKIP_BACKFILL_GUARD": "true",
            "PLATICA_CLIENT_NAME": "Contacto legado",
            "MATCHES_HABILITADO": "false",
        }
        with patch.dict(os.environ, legacy_env, clear=True):
            loaded = Config.from_env()

        self.assertEqual("contactos-legacy", loaded.contactos_data_source_id)
        self.assertTrue(loaded.contactos_legacy_database)
        self.assertEqual("", loaded.citas_data_source_id)
        self.assertEqual(7, loaded.max_contacts_per_cycle)
        self.assertEqual(22, loaded.contact_backfill_guard_max)
        self.assertTrue(loaded.skip_contact_backfill_guard)
        self.assertEqual("Contacto legado", loaded.contact_client_name)

    def test_match_environment_is_required_only_when_matches_are_enabled(self):
        environment = {
            "NOTION_TOKEN": "notion",
            "NOTION_DATABASE_ID": "contactos-legacy",
            "PLATICA_API_KEY": "platica",
            "PLATICA_AGENT_ID": "agente",
            "MATCHES_HABILITADO": "true",
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaisesRegex(
                RuntimeError, "NOTION_CITAS_DATA_SOURCE_ID"
            ):
                Config.from_env()

    def test_contact_query_uses_legacy_endpoint_when_legacy_env_is_used(self):
        worker = Middleware(config(contactos_legacy_database=True))
        worker.query_legacy_database = Mock(return_value=[])
        worker.query_data_source = Mock(
            side_effect=AssertionError("no debe usar data source nuevo")
        )

        worker.query_pending_contacts()

        worker.query_legacy_database.assert_called_once()
        worker.query_data_source.assert_not_called()


class MatchSelectionTests(unittest.TestCase):
    def test_selects_pending_failed_and_stale_only(self):
        now = datetime.now(timezone.utc)
        stale = (now - timedelta(minutes=61)).isoformat()
        fresh = (now - timedelta(minutes=5)).isoformat()
        rows = [
            match_row("row1"),
            match_row("row2", state="Falló", attempts=1),
            match_row("row3", state="En curso", attempts=1, started_at=stale),
            match_row("row4", state="En curso", attempts=1, started_at=fresh),
            match_row("row5", state="Completado", attempts=1),
            match_row("row6", state="Falló", attempts=3),
            match_row("row7", assistant_id="bloqueo"),
        ]
        worker = Middleware(config())
        worker.query_data_source = Mock(return_value=rows)

        selected = worker.query_match_rows()

        self.assertEqual(["row1", "row2", "row3"], [row["id"] for row in selected])
        _, query_filter = worker.query_data_source.call_args.args
        relation_filters = query_filter["and"]
        self.assertEqual(
            {"is_not_empty": True},
            relation_filters[0]["relation"],
        )
        self.assertEqual(
            {"is_not_empty": True},
            relation_filters[1]["relation"],
        )

    def test_missing_claim_date_is_reclaimable(self):
        worker = Middleware(config())
        worker.query_data_source = Mock(
            return_value=[match_row("row1", state="En curso", attempts=1)]
        )

        self.assertEqual(["row1"], [row["id"] for row in worker.query_match_rows()])


class ProcessingTests(unittest.TestCase):
    def test_match_flag_off_makes_no_calls(self):
        worker = Middleware(config(matches_habilitado=False))
        worker.query_match_rows = Mock(side_effect=AssertionError("no debe consultar"))

        self.assertEqual(0, worker.process_matches_once())
        worker.query_match_rows.assert_not_called()

    def test_accepted_match_is_claimed_and_left_in_progress(self):
        worker = Middleware(config())
        worker.query_match_rows = Mock(return_value=[match_row("row1")])
        worker.patch_page = Mock(return_value={})
        worker.notify_agent = Mock(return_value=(True, {"ok": True}))

        self.assertEqual(1, worker.process_matches_once())

        worker.patch_page.assert_called_once()
        page_id, claim = worker.patch_page.call_args.args
        self.assertEqual("row1", page_id)
        self.assertEqual(
            "En curso",
            claim["Estado Enriquecimiento Match"]["select"]["name"],
        )
        self.assertEqual(1, claim["Intentos Enriquecimiento Match"]["number"])
        message = worker.notify_agent.call_args.kwargs["message"]
        self.assertIn("tipo_tarea=match", message)
        self.assertIn("cita_page_id: row1", message)
        self.assertIn("sponsor_page_id: sponsor", message)
        self.assertIn("asistente_page_id: asistente", message)

    def test_rejected_match_is_marked_failed(self):
        worker = Middleware(config())
        worker.query_match_rows = Mock(
            return_value=[match_row("row1", state="Falló", attempts=1)]
        )
        worker.patch_page = Mock(return_value={})
        worker.notify_agent = Mock(return_value=(False, {}))

        self.assertEqual(0, worker.process_matches_once())

        self.assertEqual(2, worker.patch_page.call_count)
        claim = worker.patch_page.call_args_list[0].args[1]
        failure = worker.patch_page.call_args_list[1].args[1]
        self.assertEqual(2, claim["Intentos Enriquecimiento Match"]["number"])
        self.assertEqual(
            "Falló",
            failure["Estado Enriquecimiento Match"]["select"]["name"],
        )
        self.assertNotIn("Match Ideal Sponsor", failure)
        self.assertNotIn("Explicación Match Ideal", failure)

    def test_contact_flow_still_marks_checkbox_after_acceptance(self):
        worker = Middleware(config())
        contact = {
            "id": "contacto1",
            "properties": {
                "Nombre": text_prop("Ana Pérez", "title"),
                "Empresa": text_prop("Moda SA"),
            },
        }
        worker.query_pending_contacts = Mock(return_value=[contact])
        worker.notify_agent = Mock(return_value=(True, {}))
        worker.patch_page = Mock(return_value={})

        self.assertEqual(1, worker.process_contacts_once())
        worker.patch_page.assert_called_once_with(
            "contacto1",
            {"Webhook enviado": {"checkbox": True}},
        )
        self.assertIn(
            "tipo_tarea=contacto",
            worker.notify_agent.call_args.kwargs["message"],
        )


class GuardTests(unittest.TestCase):
    def test_match_backfill_guard_aborts(self):
        worker = Middleware(
            config(
                contactos_habilitado=False,
                match_backfill_guard_max=1,
            )
        )
        worker.query_match_rows = Mock(
            return_value=[match_row("row1"), match_row("row2")]
        )

        with self.assertRaisesRegex(RuntimeError, "2 matches pendientes"):
            worker.guard_backfill()

    def test_guard_can_be_explicitly_skipped(self):
        worker = Middleware(
            config(
                contactos_habilitado=False,
                match_backfill_guard_max=1,
                skip_match_backfill_guard=True,
            )
        )
        worker.query_match_rows = Mock(
            return_value=[match_row("row1"), match_row("row2")]
        )

        worker.guard_backfill()


if __name__ == "__main__":
    unittest.main()

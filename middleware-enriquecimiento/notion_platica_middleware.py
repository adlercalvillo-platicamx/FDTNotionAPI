#!/usr/bin/env python3
"""Poller Notion -> Plática para enriquecimiento de contactos y matches."""

from __future__ import annotations

import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass


NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"
NOTION_LEGACY_VERSION = "2022-06-28"
PLATICA_CHAT = "https://api.platica.mx/v1/chat"

CONTACT_CHECKBOX = "Webhook enviado"
MATCH_RESULT = "Match Ideal Sponsor"
MATCH_EXPLANATION = "Explicación Match Ideal"
MATCH_STATE = "Estado Enriquecimiento Match"
MATCH_ATTEMPTS = "Intentos Enriquecimiento Match"
MATCH_DATE = "Fecha Enriquecimiento Match"

EXCLUDED_CONTACT_CATEGORIES = ("Prensa", "Comite/Team")

log = logging.getLogger("notion-platica-enriquecimiento")


def env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() == "true"


def env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


def env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.environ.get(name)
        if value is not None and value.strip():
            return value
    return default


def env_bool_first(*names: str, default: bool) -> bool:
    return env_first(*names, default=str(default)).strip().lower() == "true"


def env_int_first(*names: str, default: int) -> int:
    return int(env_first(*names, default=str(default)))


@dataclass(frozen=True)
class Config:
    notion_token: str
    contactos_data_source_id: str
    citas_data_source_id: str
    contacto_bloqueo_agenda_id: str
    platica_api_key: str
    platica_agent_id: str
    poll_seconds: int = 600
    use_delay: bool = True
    delay_ms: int = 3000
    contactos_habilitado: bool = True
    matches_habilitado: bool = False
    exclude_sponsor: bool = False
    max_contacts_per_cycle: int = 10
    max_matches_per_cycle: int = 10
    contact_backfill_guard_max: int = 15
    match_backfill_guard_max: int = 15
    skip_contact_backfill_guard: bool = False
    skip_match_backfill_guard: bool = False
    match_stale_minutes: int = 60
    match_max_attempts: int = 3
    contact_client_name: str = "Enriquecimiento - Contacto"
    match_client_name: str = "Enriquecimiento - Match"
    contactos_legacy_database: bool = False

    @classmethod
    def from_env(cls) -> "Config":
        contactos_data_source_id = os.environ.get(
            "NOTION_CONTACTOS_DATA_SOURCE_ID"
        )
        legacy_database_id = os.environ.get("NOTION_DATABASE_ID")
        matches_habilitado = env_bool("MATCHES_HABILITADO", False)
        required = {
            "NOTION_TOKEN": os.environ.get("NOTION_TOKEN"),
            "NOTION_CONTACTOS_DATA_SOURCE_ID o NOTION_DATABASE_ID": (
                contactos_data_source_id or legacy_database_id
            ),
            "PLATICA_API_KEY": os.environ.get("PLATICA_API_KEY"),
            "PLATICA_AGENT_ID": os.environ.get("PLATICA_AGENT_ID"),
        }
        if matches_habilitado:
            required.update(
                {
                    "NOTION_CITAS_DATA_SOURCE_ID": os.environ.get(
                        "NOTION_CITAS_DATA_SOURCE_ID"
                    ),
                    "NOTION_CONTACTO_BLOQUEO_AGENDA_ID": os.environ.get(
                        "NOTION_CONTACTO_BLOQUEO_AGENDA_ID"
                    ),
                }
            )
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(
                "Faltan variables requeridas: " + ", ".join(sorted(missing))
            )
        return cls(
            notion_token=required["NOTION_TOKEN"],
            contactos_data_source_id=(
                contactos_data_source_id or legacy_database_id or ""
            ),
            citas_data_source_id=os.environ.get(
                "NOTION_CITAS_DATA_SOURCE_ID", ""
            ),
            contacto_bloqueo_agenda_id=os.environ.get(
                "NOTION_CONTACTO_BLOQUEO_AGENDA_ID", ""
            ),
            platica_api_key=required["PLATICA_API_KEY"],
            platica_agent_id=required["PLATICA_AGENT_ID"],
            poll_seconds=env_int("POLL_SECONDS", 600),
            use_delay=env_bool("USE_DELAY", True),
            delay_ms=env_int("DELAY_MS", 3000),
            contactos_habilitado=env_bool("CONTACTOS_HABILITADO", True),
            matches_habilitado=matches_habilitado,
            exclude_sponsor=env_bool("EXCLUDE_SPONSOR", False),
            max_contacts_per_cycle=env_int_first(
                "MAX_CONTACTS_PER_CYCLE", "MAX_PER_CYCLE", default=10
            ),
            max_matches_per_cycle=env_int("MAX_MATCHES_PER_CYCLE", 10),
            contact_backfill_guard_max=env_int_first(
                "CONTACT_BACKFILL_GUARD_MAX",
                "BACKFILL_GUARD_MAX",
                default=15,
            ),
            match_backfill_guard_max=env_int("MATCH_BACKFILL_GUARD_MAX", 15),
            skip_contact_backfill_guard=env_bool_first(
                "SKIP_CONTACT_BACKFILL_GUARD",
                "SKIP_BACKFILL_GUARD",
                default=False,
            ),
            skip_match_backfill_guard=env_bool(
                "SKIP_MATCH_BACKFILL_GUARD", False
            ),
            match_stale_minutes=env_int("MATCH_STALE_MINUTES", 60),
            match_max_attempts=env_int("MATCH_MAX_ATTEMPTS", 3),
            contact_client_name=env_first(
                "PLATICA_CONTACT_CLIENT_NAME",
                "PLATICA_CLIENT_NAME",
                default="Enriquecimiento - Contacto",
            ),
            match_client_name=os.environ.get(
                "PLATICA_MATCH_CLIENT_NAME", "Enriquecimiento - Match"
            ),
            contactos_legacy_database=not bool(contactos_data_source_id),
        )


def _plain_text(prop: dict[str, Any] | None) -> str:
    if not prop:
        return ""
    prop_type = prop.get("type")
    if prop_type in ("title", "rich_text"):
        return "".join(
            item.get("plain_text")
            or item.get("text", {}).get("content", "")
            for item in prop.get(prop_type, [])
        ).strip()
    if prop_type == "select":
        return (prop.get("select") or {}).get("name", "")
    if prop_type == "rollup":
        rollup = prop.get("rollup") or {}
        if rollup.get("type") == "array":
            return " · ".join(
                value
                for value in (_plain_text(item) for item in rollup.get("array", []))
                if value
            )
        return str(rollup.get(rollup.get("type"), "") or "")
    return ""


def _relation_id(page: dict[str, Any], property_name: str) -> str:
    relation = (
        page.get("properties", {}).get(property_name, {}).get("relation", [])
    )
    return relation[0].get("id", "") if relation else ""


def _select_name(page: dict[str, Any], property_name: str) -> str:
    return (
        page.get("properties", {})
        .get(property_name, {})
        .get("select")
        or {}
    ).get("name", "")


def _number_value(page: dict[str, Any], property_name: str) -> int:
    value = page.get("properties", {}).get(property_name, {}).get("number")
    return int(value or 0)


def _date_start(page: dict[str, Any], property_name: str) -> str:
    return (
        page.get("properties", {}).get(property_name, {}).get("date") or {}
    ).get("start", "")


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


class Middleware:
    def __init__(self, config: Config, session: Any = requests):
        self.config = config
        self.session = session

    def notion_headers(self, version: str = NOTION_VERSION) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.notion_token}",
            "Notion-Version": version,
            "Content-Type": "application/json",
        }

    def platica_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.config.platica_api_key}",
            "Content-Type": "application/json",
        }

    def query_data_source(
        self, data_source_id: str, filter_body: dict[str, Any]
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            payload: dict[str, Any] = {
                "filter": filter_body,
                "page_size": 100,
            }
            if cursor:
                payload["start_cursor"] = cursor
            response = self.session.post(
                f"{NOTION_API}/data_sources/{data_source_id}/query",
                headers=self.notion_headers(),
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            results.extend(data.get("results", []))
            if not data.get("has_more"):
                return results
            cursor = data.get("next_cursor")

    def query_legacy_database(
        self, database_id: str, filter_body: dict[str, Any]
    ) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            payload: dict[str, Any] = {
                "filter": filter_body,
                "page_size": 100,
            }
            if cursor:
                payload["start_cursor"] = cursor
            response = self.session.post(
                f"{NOTION_API}/databases/{database_id}/query",
                headers=self.notion_headers(NOTION_LEGACY_VERSION),
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            results.extend(data.get("results", []))
            if not data.get("has_more"):
                return results
            cursor = data.get("next_cursor")

    def patch_page(
        self, page_id: str, properties: dict[str, Any]
    ) -> dict[str, Any]:
        response = self.session.patch(
            f"{NOTION_API}/pages/{page_id}",
            headers=self.notion_headers(),
            json={"properties": properties},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def query_pending_contacts(self) -> list[dict[str, Any]]:
        excluded = list(EXCLUDED_CONTACT_CATEGORIES)
        if self.config.exclude_sponsor:
            excluded.append("Sponsor")
        conditions: list[dict[str, Any]] = [
            {
                "property": CONTACT_CHECKBOX,
                "checkbox": {"equals": False},
            }
        ]
        conditions.extend(
            {
                "property": "Categoria",
                "select": {"does_not_equal": category},
            }
            for category in excluded
        )
        query = (
            self.query_legacy_database
            if self.config.contactos_legacy_database
            else self.query_data_source
        )
        return query(self.config.contactos_data_source_id, {"and": conditions})

    def query_match_rows(self) -> list[dict[str, Any]]:
        rows = self.query_data_source(
            self.config.citas_data_source_id,
            {
                "and": [
                    {
                        "property": "Contacto Match",
                        "relation": {"is_not_empty": True},
                    },
                    {
                        "property": "Contacto Principal",
                        "relation": {"is_not_empty": True},
                    },
                ]
            },
        )
        now = datetime.now(timezone.utc)
        stale_before = now - timedelta(minutes=self.config.match_stale_minutes)
        pending: list[dict[str, Any]] = []
        for row in rows:
            assistant_id = _relation_id(row, "Contacto Principal")
            if assistant_id == self.config.contacto_bloqueo_agenda_id:
                continue
            attempts = _number_value(row, MATCH_ATTEMPTS)
            if attempts >= self.config.match_max_attempts:
                continue
            state = _select_name(row, MATCH_STATE)
            if not state or state == "Falló":
                pending.append(row)
                continue
            if state == "En curso":
                started_at = _parse_datetime(_date_start(row, MATCH_DATE))
                if not started_at or started_at < stale_before:
                    pending.append(row)
        return sorted(
            pending,
            key=lambda row: str(row.get("created_time") or ""),
        )

    def notify_agent(
        self, *, message: str, client_id: str, client_name: str
    ) -> tuple[bool, dict[str, Any]]:
        body: dict[str, Any] = {
            "agentId": self.config.platica_agent_id,
            "message": message,
            "client": {"id": client_id, "name": client_name},
        }
        if self.config.use_delay:
            body["delay"] = self.config.delay_ms
        response = self.session.post(
            PLATICA_CHAT,
            headers=self.platica_headers(),
            json=body,
            timeout=60,
        )
        try:
            data = response.json()
        except Exception:
            data = {}
        if 200 <= response.status_code < 300:
            return True, data
        log.error(
            "Plática rechazó tarea client=%s status=%s body=%s",
            client_id,
            response.status_code,
            response.text[:300],
        )
        return False, data

    def process_contacts_once(self) -> int:
        if not self.config.contactos_habilitado:
            return 0
        pending = self.query_pending_contacts()
        sent = 0
        for page in pending[: self.config.max_contacts_per_cycle]:
            page_id = page["id"]
            name = _plain_text(page.get("properties", {}).get("Nombre"))
            if not name:
                log.warning("Contacto %s sin Nombre; se omite.", page_id)
                continue
            company = _plain_text(page.get("properties", {}).get("Empresa"))
            company_text = f" | Empresa: {company}" if company else ""
            message = (
                "tipo_tarea=contacto | corrida automática desatendida. "
                f"Nombre: {name}{company_text} | page_id: {page_id}. "
                "Enriquece este contacto siguiendo el protocolo CONTACTO."
            )
            client_name = self.config.contact_client_name.replace(
                "{nombre}", name
            )
            accepted, _ = self.notify_agent(
                message=message,
                client_id=page_id,
                client_name=client_name,
            )
            if not accepted:
                continue
            self.patch_page(
                page_id,
                {CONTACT_CHECKBOX: {"checkbox": True}},
            )
            sent += 1
            log.info("Contacto notificado y marcado: %s (%s)", name, page_id)
        return sent

    def process_matches_once(self) -> int:
        if not self.config.matches_habilitado:
            return 0
        pending = self.query_match_rows()
        sent = 0
        for row in pending[: self.config.max_matches_per_cycle]:
            page_id = row["id"]
            sponsor_id = _relation_id(row, "Contacto Match")
            assistant_id = _relation_id(row, "Contacto Principal")
            attempts = _number_value(row, MATCH_ATTEMPTS) + 1
            now_iso = datetime.now(timezone.utc).isoformat()
            claim = {
                MATCH_STATE: {"select": {"name": "En curso"}},
                MATCH_ATTEMPTS: {"number": attempts},
                MATCH_DATE: {"date": {"start": now_iso}},
            }
            self.patch_page(page_id, claim)

            properties = row.get("properties", {})
            sponsor_company = _plain_text(properties.get("Empresa Sponsor"))
            assistant_company = _plain_text(
                properties.get("Empresa (asistente)")
            )
            title = _plain_text(properties.get("Nombre"))
            message = (
                "tipo_tarea=match | corrida automática desatendida. "
                f"cita_page_id: {page_id} | sponsor_page_id: {sponsor_id} | "
                f"asistente_page_id: {assistant_id} | "
                f"empresa_sponsor: {sponsor_company or 'sin dato'} | "
                f"empresa_asistente: {assistant_company or 'sin dato'} | "
                f"titulo_cita: {title or 'sin dato'}. "
                "Evalúa este par siguiendo exclusivamente el protocolo MATCH."
            )
            accepted, _ = self.notify_agent(
                message=message,
                client_id=page_id,
                client_name=self.config.match_client_name,
            )
            if accepted:
                sent += 1
                log.info(
                    "Match enviado: %s × %s (%s), intento %s",
                    assistant_company,
                    sponsor_company,
                    page_id,
                    attempts,
                )
                continue
            self.patch_page(
                page_id,
                {
                    MATCH_STATE: {"select": {"name": "Falló"}},
                    MATCH_DATE: {"date": {"start": now_iso}},
                },
            )
        return sent

    def guard_backfill(self) -> None:
        if self.config.contactos_habilitado:
            contact_count = len(self.query_pending_contacts())
            if (
                not self.config.skip_contact_backfill_guard
                and contact_count > self.config.contact_backfill_guard_max
            ):
                raise RuntimeError(
                    f"ABORTADO: {contact_count} contactos pendientes superan "
                    f"CONTACT_BACKFILL_GUARD_MAX={self.config.contact_backfill_guard_max}"
                )
        if self.config.matches_habilitado:
            match_count = len(self.query_match_rows())
            if (
                not self.config.skip_match_backfill_guard
                and match_count > self.config.match_backfill_guard_max
            ):
                raise RuntimeError(
                    f"ABORTADO: {match_count} matches pendientes superan "
                    f"MATCH_BACKFILL_GUARD_MAX={self.config.match_backfill_guard_max}"
                )

    def process_once(self) -> dict[str, int]:
        return {
            "contactos": self.process_contacts_once(),
            "matches": self.process_matches_once(),
        }


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)s  %(message)s",
    )
    config = Config.from_env()
    worker = Middleware(config)
    log.info(
        "Arrancando poller: contactos=%s matches=%s poll=%ss",
        config.contactos_habilitado,
        config.matches_habilitado,
        config.poll_seconds,
    )
    worker.guard_backfill()
    backoff = config.poll_seconds
    while True:
        try:
            result = worker.process_once()
            if result["contactos"] or result["matches"]:
                log.info("Ciclo completado: %s", result)
            backoff = config.poll_seconds
            time.sleep(config.poll_seconds)
        except requests.HTTPError as error:
            log.error("Error HTTP: %s", error)
            backoff = min(backoff * 2, 600)
            time.sleep(backoff)
        except KeyboardInterrupt:
            log.info("Detenido por el usuario.")
            return
        except Exception as error:
            log.exception("Error inesperado: %s", error)
            backoff = min(backoff * 2, 600)
            time.sleep(backoff)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        log.error("%s", error)
        sys.exit(1)

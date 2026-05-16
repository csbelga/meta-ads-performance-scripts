"""
Meta Ads CPL Monitor (Python version)

Coleta dados de campanhas ativas no Meta Ads, calcula CPL por campanha,
gera relatorio em CSV e dispara alerta por e-mail quando o CPL ultrapassa
o limite configurado.

Equivalente Python da versao em Google Apps Script. Use esta versao quando
preferir rodar em ambiente proprio (servidor, container, cron local).

Autor: Christian Belga
Licenca: MIT
"""

import os
import sys
import csv
import smtplib
import logging
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List, Dict, Any

import requests
from dotenv import load_dotenv


# ============================================================
# CONFIGURACAO via variaveis de ambiente (.env)
# ============================================================
load_dotenv()

META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN")
META_AD_ACCOUNT_ID = os.getenv("META_AD_ACCOUNT_ID")
CPL_LIMIT_BRL = float(os.getenv("CPL_LIMIT_BRL", "25.00"))
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

META_API_VERSION = "v19.0"
META_API_BASE = f"https://graph.facebook.com/{META_API_VERSION}"

OUTPUT_DIR = "reports"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("cpl_monitor")


# ============================================================
# COLETA DE CAMPANHAS ATIVAS
# ============================================================
def fetch_active_campaigns() -> List[Dict[str, Any]]:
    url = f"{META_API_BASE}/act_{META_AD_ACCOUNT_ID}/campaigns"
    params = {
        "fields": "id,name,status,daily_budget",
        "filtering": '[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]',
        "access_token": META_ACCESS_TOKEN,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json().get("data", [])


# ============================================================
# COLETA DE METRICAS DO DIA POR CAMPANHA
# ============================================================
def fetch_insights(campaign_id: str) -> Dict[str, Any]:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    url = f"{META_API_BASE}/{campaign_id}/insights"
    params = {
        "fields": "spend,actions,impressions,clicks",
        "time_range": f'{{"since":"{today}","until":"{today}"}}',
        "access_token": META_ACCESS_TOKEN,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    return data[0] if data else {}


def extract_leads(actions: List[Dict[str, Any]]) -> int:
    if not actions:
        return 0
    lead_types = {"lead", "onsite_conversion.lead_grouped"}
    return sum(
        int(a.get("value", 0))
        for a in actions
        if a.get("action_type") in lead_types
    )


# ============================================================
# AGREGACAO POR CAMPANHA
# ============================================================
def build_campaign_report() -> List[Dict[str, Any]]:
    campaigns = fetch_active_campaigns()
    log.info(f"Encontradas {len(campaigns)} campanhas ativas.")

    report = []
    for campaign in campaigns:
        insight = fetch_insights(campaign["id"])
        spend = float(insight.get("spend", 0))
        leads = extract_leads(insight.get("actions"))
        cpl = spend / leads if leads > 0 else 0.0
        daily_budget = float(campaign.get("daily_budget", 0)) / 100

        report.append({
            "campaign_id": campaign["id"],
            "campaign_name": campaign["name"],
            "spend_brl": round(spend, 2),
            "leads": leads,
            "cpl_brl": round(cpl, 2),
            "impressions": int(insight.get("impressions", 0)),
            "clicks": int(insight.get("clicks", 0)),
            "daily_budget_brl": round(daily_budget, 2),
            "alert": "ACIMA DO LIMITE" if cpl > CPL_LIMIT_BRL and leads > 0 else "OK",
        })

    return report


# ============================================================
# EXPORTA REPORT EM CSV
# ============================================================
def export_csv(report: List[Dict[str, Any]]) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    filepath = os.path.join(OUTPUT_DIR, f"cpl_report_{timestamp}.csv")

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=report[0].keys())
        writer.writeheader()
        writer.writerows(report)

    log.info(f"Relatorio salvo em {filepath}")
    return filepath


# ============================================================
# DISPARA ALERTA POR E-MAIL
# ============================================================
def send_alert_email(alerts: List[Dict[str, Any]]) -> None:
    if not alerts:
        return

    body_lines = [f"Alerta de CPL acima do limite (R$ {CPL_LIMIT_BRL:.2f})\n"]
    for item in alerts:
        body_lines.append(
            f"Campanha: {item['campaign_name']}\n"
            f"CPL atual: R$ {item['cpl_brl']:.2f}\n"
            f"Gasto hoje: R$ {item['spend_brl']:.2f}\n"
            f"Leads: {item['leads']}\n"
            f"Budget diario: R$ {item['daily_budget_brl']:.2f}\n"
            f"---\n"
        )
    body = "\n".join(body_lines)

    msg = MIMEMultipart()
    msg["From"] = SMTP_USER
    msg["To"] = ALERT_EMAIL_TO
    msg["Subject"] = f"[CPL Monitor] {len(alerts)} campanhas acima do limite"
    msg.attach(MIMEText(body, "plain", "utf-8"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)

    log.info(f"Alerta enviado para {ALERT_EMAIL_TO} ({len(alerts)} campanhas)")


# ============================================================
# ENTRY POINT
# ============================================================
def main() -> int:
    if not all([META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, ALERT_EMAIL_TO]):
        log.error("Variaveis de ambiente obrigatorias ausentes. Veja .env.example.")
        return 1

    try:
        report = build_campaign_report()
        if not report:
            log.warning("Nenhuma campanha ativa encontrada. Encerrando.")
            return 0

        export_csv(report)
        alerts = [r for r in report if r["alert"] == "ACIMA DO LIMITE"]
        send_alert_email(alerts)
        return 0
    except Exception as e:
        log.exception(f"Falha na execucao: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

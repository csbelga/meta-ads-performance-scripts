/**
 * Meta Ads CPL Monitor
 *
 * Google Apps Script que coleta dados de campanhas do Meta Ads,
 * preenche dashboard em Google Sheets e dispara alerta por e-mail
 * quando o custo por lead ultrapassa o limite configurado.
 *
 * Configuracao:
 * 1. Crie um projeto Apps Script vinculado a uma planilha Google Sheets
 * 2. Defina as constantes abaixo (ou use PropertiesService para producao)
 * 3. Configure um gatilho de tempo para rodar duas vezes ao dia, 08h e 17h
 *
 * Autor: Christian Belga
 * Licenca: MIT
 */

// ============================================================
// CONFIGURACAO. Em producao, use PropertiesService.getScriptProperties()
// no lugar de constantes hardcoded.
// ============================================================
const META_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN');
const META_AD_ACCOUNT_ID = PropertiesService.getScriptProperties().getProperty('META_AD_ACCOUNT_ID');
const CPL_LIMIT_BRL = 25.00;   // Limite de alerta. Ajuste por vertical.
const ALERT_EMAIL = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
const SHEET_NAME = 'Dashboard CPL';

const META_API_VERSION = 'v19.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ============================================================
// FUNCAO PRINCIPAL. Acionada pelo gatilho de tempo.
// ============================================================
function runCplMonitor() {
  try {
    const campaigns = fetchActiveCampaigns();
    const insights = enrichWithInsights(campaigns);
    updateDashboard(insights);
    triggerAlertsIfNeeded(insights);
    Logger.log(`Execucao concluida. ${insights.length} campanhas processadas.`);
  } catch (err) {
    Logger.log(`Erro: ${err.message}`);
    MailApp.sendEmail(ALERT_EMAIL, '[CPL Monitor] Falha na execucao', err.message);
  }
}

// ============================================================
// COLETA DE CAMPANHAS ATIVAS
// ============================================================
function fetchActiveCampaigns() {
  const url = `${META_API_BASE}/act_${META_AD_ACCOUNT_ID}/campaigns`
    + `?fields=id,name,status,daily_budget`
    + `&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]`
    + `&access_token=${META_ACCESS_TOKEN}`;

  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const payload = JSON.parse(response.getContentText());

  if (payload.error) {
    throw new Error(`Meta API error: ${payload.error.message}`);
  }

  return payload.data || [];
}

// ============================================================
// ENRIQUECE COM METRICAS DO DIA (spend, leads, CPL)
// ============================================================
function enrichWithInsights(campaigns) {
  const today = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');

  return campaigns.map(campaign => {
    const url = `${META_API_BASE}/${campaign.id}/insights`
      + `?fields=spend,actions,impressions,clicks`
      + `&time_range={"since":"${today}","until":"${today}"}`
      + `&access_token=${META_ACCESS_TOKEN}`;

    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const payload = JSON.parse(response.getContentText());

    const insight = (payload.data && payload.data[0]) || {};
    const spend = parseFloat(insight.spend || 0);
    const leads = extractLeads(insight.actions);
    const cpl = leads > 0 ? spend / leads : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      spend: spend,
      leads: leads,
      cpl: cpl,
      impressions: parseInt(insight.impressions || 0, 10),
      clicks: parseInt(insight.clicks || 0, 10),
      dailyBudget: parseFloat(campaign.daily_budget || 0) / 100  // Meta retorna em centavos
    };
  });
}

// ============================================================
// EXTRAI EVENTOS DE LEAD (lead form + on-site lead)
// ============================================================
function extractLeads(actions) {
  if (!actions) return 0;
  const leadActions = actions.filter(a =>
    a.action_type === 'lead' ||
    a.action_type === 'onsite_conversion.lead_grouped'
  );
  return leadActions.reduce((sum, a) => sum + parseInt(a.value || 0, 10), 0);
}

// ============================================================
// ATUALIZA DASHBOARD NO GOOGLE SHEETS
// ============================================================
function updateDashboard(insights) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

  sheet.clear();
  sheet.appendRow([
    'Data', 'Campanha', 'Gasto (R$)', 'Leads', 'CPL (R$)',
    'Impressoes', 'Cliques', 'Budget Diario (R$)', 'Status Alerta'
  ]);

  const timestamp = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm');

  insights.forEach(item => {
    sheet.appendRow([
      timestamp,
      item.name,
      item.spend.toFixed(2),
      item.leads,
      item.cpl.toFixed(2),
      item.impressions,
      item.clicks,
      item.dailyBudget.toFixed(2),
      item.cpl > CPL_LIMIT_BRL ? 'ACIMA DO LIMITE' : 'OK'
    ]);
  });

  // Formatacao basica de cabecalho
  sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1e2327').setFontColor('#ffffff');
  sheet.autoResizeColumns(1, 9);
}

// ============================================================
// DISPARA ALERTA POR E-MAIL QUANDO CPL ULTRAPASSA O LIMITE
// ============================================================
function triggerAlertsIfNeeded(insights) {
  const alerts = insights.filter(item => item.cpl > CPL_LIMIT_BRL && item.leads > 0);

  if (alerts.length === 0) return;

  let body = `Alerta de CPL acima do limite (R$ ${CPL_LIMIT_BRL.toFixed(2)})\n\n`;
  alerts.forEach(item => {
    body += `Campanha: ${item.name}\n`;
    body += `CPL atual: R$ ${item.cpl.toFixed(2)}\n`;
    body += `Gasto hoje: R$ ${item.spend.toFixed(2)}\n`;
    body += `Leads: ${item.leads}\n`;
    body += `Budget diario: R$ ${item.dailyBudget.toFixed(2)}\n`;
    body += `\n---\n\n`;
  });

  MailApp.sendEmail(ALERT_EMAIL, `[CPL Monitor] ${alerts.length} campanhas acima do limite`, body);
}

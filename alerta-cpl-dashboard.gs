// Automação de alerta de CPL para campanhas Meta Ads
// Desenvolvido por Christian Belga

function monitorarCPL() {
  const sheet = SpreadsheetApp.openById('INSIRA_ID_DO_SHEET').getSheetByName('Campanhas');
  const dados = sheet.getDataRange().getValues();
  
  const limiteCPL = 10; // Exemplo: R$10,00 por lead
  let campanhasAcimaLimite = [];

  for (let i = 1; i < dados.length; i++) {
    const nomeCampanha = dados[i][0];
    const cpl = parseFloat(dados[i][1]);

    if (cpl > limiteCPL) {
      campanhasAcimaLimite.push(`${nomeCampanha}: R$${cpl.toFixed(2)}`);
    }
  }

  if (campanhasAcimaLimite.length > 0) {
    const corpo = `Campanhas com CPL acima do limite:\n\n${campanhasAcimaLimite.join('\n')}`;
    MailApp.sendEmail('seu@email.com', '🚨 Alerta de CPL Alto', corpo);
  }
}

# Meta Ads – Automação de Alerta de CPL e Dashboard

Projeto de automação de performance para campanhas Meta Ads, com foco em:
- Monitoramento automático de custo por lead (CPL)
- Alerta por e-mail quando o CPL ultrapassa limite diário
- Atualização de dashboard no Google Sheets com dados por campanha

## Objetivo
Reduzir o tempo de análise operacional e permitir decisões rápidas com base em dados críticos de performance, protegendo ROI e volume de geração de leads.

## Tecnologias Utilizadas
- Google Apps Script
- API do Meta Ads
- Google Sheets
- Gmail (para alertas)

## Lógica da Automação
1. Consulta diária de dados via API do Meta Ads (budget, spend, leads)
2. Cálculo automático do CPL por campanha
3. Preenchimento em tempo real de uma planilha do Google Sheets
4. Disparo de alerta via e-mail se CPL > R$X,XX
5. Loop diário às 8h e 17h

## KPIs Monitorados
- Custo por Lead (CPL)
- Leads por campanha
- ROAS (se disponível)
- Spent total e diário

## Exemplo de Alerta
> ⚠️ CPL acima do limite:  
> Campanha: [Nome da campanha]  
> CPL: R$32,60 | Limite: R$20,00  
> Spent hoje: R$300,00  
> Leads: 9

## Próximos Passos
- Adicionar benchmark do mercado para comparação automática
- Integração com Slack ou Notion para alertas alternativos

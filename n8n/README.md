# Automações n8n planejadas

O n8n será orquestrador. A aplicação continuará sendo a fonte de verdade das regras financeiras.

## ML Orders Sync
Cron -> API interna Mercado Radar -> Mercado Livre -> PostgreSQL.

## Profit Recalculation
Após sincronização de pedido/custo -> endpoint interno -> recalcula lucro real.

## Stock Alert
Produto lucrativo + estoque abaixo do mínimo -> notificação.

## Opportunity Review
Produtos candidatos sem análise recente -> fila para reavaliar preços/tarifas.

Os workflows serão versionados aqui em JSON quando a integração Mercado Livre estiver ativa.

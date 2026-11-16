# Atualizar o Radar Logitech

Use a ferramenta registrar_consulta do Site quando ela estiver disponível. Alternativamente, obtenha a URL e o acesso de serviço do Site pelo get_site de Sites. Envie o acesso somente em OAI-Sites-Authorization para esse Site. Use POST /api/consultas com Content-Type application/json. O corpo contém note (resumo da consulta) e offers (lista, que pode estar vazia). Cada oferta tem product (webcam para 960-001087, c920s para 960-001257, headset para 981-001262), store, url e price (preço à vista em reais). Campos opcionais: seller, source, shipping, delivery, card (total sem frete), installments, advertised. Inclua shipping e delivery somente se confirmados para o CEP configurado em Meu perfil.

As consultas repetidas no mesmo dia atualizam o registro daquela data e as ofertas daquela loja, produto e vendedor. Confirme a gravação com ler_radar ou GET /api/radar. Nunca copie credenciais para arquivos, prompts ou respostas.

Leia products via ler_radar ou GET /api/radar antes de pesquisar. Use os IDs e SKUs retornados, inclusive os cadastrados pelo painel. Cadastre frete e prazo apenas com o CEP cotado em cada oferta. Preserve o histórico e as decisões.

A consulta compartilhada usa a identidade autenticada do proprietário pelo MCP (ler_radar e registrar_consulta). Painéis de convidados são isolados por conta e recebem somente seus próprios registros e um resumo dos produtos destacados. O endpoint HTTP de consulta também exige identidade do proprietário.

Além de products, consulte research, a fila deduplicada de SKUs dos painéis pessoais. Pesquise essas entradas pelo SKU e grave os resultados pelo id research- retornado. A fila não inclui identidades, decisões ou links pessoais. O Radar associa leituras automáticas de preço aos painéis pelo SKU. Cotações manuais e decisões de cada pessoa são privadas.

O Radar de Periféricos aceita várias marcas. Use marca, modelo, código do fabricante e variante para verificar cada oferta. Pule entradas sem sku. Mantenha os IDs retornados pela leitura. Confira especialmente layout (ABNT2/US), cor, conexão, switches e se o produto é novo e vendido individualmente. Consulte varejistas confiáveis relevantes à categoria.

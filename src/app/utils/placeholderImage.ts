// Devolve uma URL de foto REAL (Unsplash, sem API key) compatível com o que o
// usuário está anunciando/pedindo. Não há imagens geradas por IA aqui — são
// fotos curadas, hotlinkadas diretamente do CDN do Unsplash.
//
// Regra: para cada anúncio sem foto, infere palavra-chave a partir do
// título/descrição/categoria e devolve um URL de foto real cobrindo aquele
// tópico (ex: limpeza de pele → foto real de pele/skincare).

const U = (id: string) => `https://images.unsplash.com/${id}?w=600&h=450&fit=crop&q=70`;

const KEYWORD_PHOTOS: { match: RegExp; url: string }[] = [
  // ── Beleza / cuidados pessoais ──
  { match: /\b(limpeza de pele|skincare|skin care|hidratacao facial|peeling|pele oleosa|pele seca)\b/i,
    url: U('photo-1556228720-195a672e8a03') },
  { match: /\b(facial|massagem facial|esteticista|estetica facial|tratamento facial)\b/i,
    url: U('photo-1570172619644-dfd03ed5d881') },
  { match: /\b(massagem|relaxante|spa|terapeutica)\b/i,
    url: U('photo-1544161515-4ab6ce6db874') },
  { match: /\b(botox|toxina|preenchimento|harmonizacao)\b/i,
    url: U('photo-1614308457932-e16d85c0f1d1') },
  { match: /\b(drenagem|linfatica|pos parto)\b/i,
    url: U('photo-1591343395082-e120087004b4') },
  { match: /\b(cabelo|corte de cabelo|escova|salao|hidratacao capilar|coloracao)\b/i,
    url: U('photo-1560066984-138dadb4c035') },
  { match: /\b(barba|barbeiro|barbearia)\b/i,
    url: U('photo-1503951914875-452162b0f3f1') },
  { match: /\b(sobrancelha|design de sobrancelha|micropigmentacao)\b/i,
    url: U('photo-1583241800698-9c2e0eb0fda7') },
  { match: /\b(unha|manicure|pedicure|esmalte|alongamento de unha)\b/i,
    url: U('photo-1604654894610-df63bc536371') },
  { match: /\b(maquiagem|make|batom|sombra|base|noiva)\b/i,
    url: U('photo-1522335789203-aaa2261ca3a3') },
  { match: /\b(depilacao|cera|laser)\b/i,
    url: U('photo-1607008829749-c0f284a49841') },
  { match: /\b(perfume|fragrancia|colonia)\b/i,
    url: U('photo-1541643600914-78b084683601') },
  { match: /\b(beleza|cosmetic|estetica)\b/i,
    url: U('photo-1487412947147-5cebf100ffc2') },

  // ── Saúde / fitness ──
  { match: /\b(academia|musculacao|personal trainer|crossfit|treino|fitness)\b/i,
    url: U('photo-1534438327276-14e5300c3a48') },
  { match: /\b(yoga|pilates|alongamento)\b/i,
    url: U('photo-1544367567-0f2fcb009e0b') },
  { match: /\b(nutricionista|dieta|nutri|reeducacao alimentar)\b/i,
    url: U('photo-1490645935967-10de6ba17061') },
  { match: /\b(dentista|odonto|clareamento|aparelho dental|limpeza dental)\b/i,
    url: U('photo-1606811971618-4486d14f3f99') },
  { match: /\b(fisioterapia|fisioterapeuta|reabilitacao)\b/i,
    url: U('photo-1571019613454-1cb2f99b2d8b') },
  { match: /\b(medico|consulta|exame|saude|terapia|psicolog)\b/i,
    url: U('photo-1576091160550-2173dba999ef') },

  // ── Eletrônicos ──
  { match: /\b(iphone|smartphone|celular|samsung|motorola|xiaomi|pixel)\b/i,
    url: U('photo-1511707171634-5f897ff02aa9') },
  { match: /\b(notebook|laptop|macbook|ultrabook)\b/i,
    url: U('photo-1496181133206-80ce9b88a853') },
  { match: /\b(computador|pc gamer|desktop)\b/i,
    url: U('photo-1587202372775-e229f172b9d7') },
  { match: /\b(fone|headphone|headset|airpods|earpods|earphone)\b/i,
    url: U('photo-1505740420928-5e560c06d30e') },
  { match: /\b(tv|televis|smart tv)\b/i,
    url: U('photo-1593359677879-a4bb92f829d1') },
  { match: /\b(monitor|tela)\b/i,
    url: U('photo-1527443224154-c4a3942d3acf') },
  { match: /\b(camera|cameras|fotograf|dslr)\b/i,
    url: U('photo-1502920917128-1aa500764cbd') },
  { match: /\b(drone)\b/i,
    url: U('photo-1473968512647-3e447244af8f') },
  { match: /\b(playstation|ps5|ps4)\b/i,
    url: U('photo-1606813907291-d86efa9b94db') },
  { match: /\b(xbox)\b/i,
    url: U('photo-1621259182978-fbf93132d53d') },
  { match: /\b(nintendo|switch)\b/i,
    url: U('photo-1612036782180-6f0b6cd846fe') },
  { match: /\b(console|video game|videogame|game|jogo)\b/i,
    url: U('photo-1493711662062-fa541adb3fc8') },
  { match: /\b(relogio|smartwatch|apple watch|garmin)\b/i,
    url: U('photo-1523275335684-37898b6baf30') },
  { match: /\b(tablet|ipad)\b/i,
    url: U('photo-1561154464-82e9adf32764') },

  // ── Moda ──
  { match: /\b(tenis|sneaker|nike|adidas|jordan|sapatilha)\b/i,
    url: U('photo-1542291026-7eec264c27ff') },
  { match: /\b(sapato|bota|sandalia|chinelo|salto alto)\b/i,
    url: U('photo-1543163521-1bf539c55dd2') },
  { match: /\b(bolsa|mochila|carteira)\b/i,
    url: U('photo-1553062407-98eeb64c6a62') },
  { match: /\b(vestido)\b/i,
    url: U('photo-1595777457583-95e059d581b8') },
  { match: /\b(camisa|camiseta|blusa|t-shirt|polo)\b/i,
    url: U('photo-1521572163474-6864f9cf17ab') },
  { match: /\b(jaqueta|casaco|sobretudo|moletom)\b/i,
    url: U('photo-1551028719-00167b16eac5') },
  { match: /\b(calca|jeans|short|bermuda)\b/i,
    url: U('photo-1542272604-787c3835535d') },
  { match: /\b(saia)\b/i,
    url: U('photo-1583496661160-fb5886a13d77') },
  { match: /\b(oculos|sunglasses)\b/i,
    url: U('photo-1572635196237-14b3f281503f') },
  { match: /\b(joia|aliança|anel|brinco|colar|pulseira)\b/i,
    url: U('photo-1515562141207-7a88fb7ce338') },

  // ── Casa / decoração / utilidades ──
  { match: /\b(decoracao|sofa|poltrona|estante|rack|mesa de jantar)\b/i,
    url: U('photo-1555041469-a586c61ea9bc') },
  { match: /\b(cama|colchao|cabeceira|quarto)\b/i,
    url: U('photo-1505693416388-ac5ce068fe85') },
  { match: /\b(cadeira|escritorio|home office)\b/i,
    url: U('photo-1580480055273-228ff5388ef8') },
  { match: /\b(cozinha|panela|fogao|liquidificador)\b/i,
    url: U('photo-1556909114-f6e7ad7d3136') },
  { match: /\b(geladeira|freezer)\b/i,
    url: U('photo-1610557892470-55d9e80c0bce') },
  { match: /\b(microondas)\b/i,
    url: U('photo-1574269909862-7e1d70bb8078') },
  { match: /\b(planta|jardim|jardinagem|flor|vaso|paisagismo)\b/i,
    url: U('photo-1459411552884-841db9b3cc2a') },
  { match: /\b(diarista|faxina|limpeza residencial|limpeza pos obra)\b/i,
    url: U('photo-1581578731548-c64695cc6952') },
  { match: /\b(pintura|pintor|reforma|pedreiro)\b/i,
    url: U('photo-1562259949-e8e7689d7828') },
  { match: /\b(eletricista|encanador|tecnico)\b/i,
    url: U('photo-1581094794329-c8112a89af12') },

  // ── Infantil ──
  { match: /\b(crianca|criança|bebe|infantil|carrinho de bebe|fralda)\b/i,
    url: U('photo-1492725764893-90b379c2b6e7') },
  { match: /\b(brinquedo|lego|pelucia|boneca|boneco)\b/i,
    url: U('photo-1558877385-81a1c7e67d72') },

  // ── Livros / educação ──
  { match: /\b(livro|livros|kindle|leitura)\b/i,
    url: U('photo-1512820790803-83ca734da794') },
  { match: /\b(aula|curso|professor|reforco|matematica|portugues|ingles|idioma)\b/i,
    url: U('photo-1503676260728-1c00da094a0b') },

  // ── Animais ──
  { match: /\b(cachorro|cao|caes|filhote de cachorro)\b/i,
    url: U('photo-1561037404-61cd46aa615b') },
  { match: /\b(gato|gatinho|felino)\b/i,
    url: U('photo-1514888286974-6c03e2ca1dba') },
  { match: /\b(passeador de cachorro|dog walker)\b/i,
    url: U('photo-1450778869180-41d0601e046e') },
  { match: /\b(banho e tosa|petshop|pet shop)\b/i,
    url: U('photo-1583511655826-05700d52f4d9') },
  { match: /\b(veterinario|vet|veterinaria)\b/i,
    url: U('photo-1612531822928-c4d4c97e7d8d') },
  { match: /\b(racao)\b/i,
    url: U('photo-1568640347023-a616a30bc3bd') },

  // ── Veículos ──
  { match: /\b(carro|automovel|sedan|hatch|suv)\b/i,
    url: U('photo-1542362567-b07e54358753') },
  { match: /\b(moto|motocicleta|scooter)\b/i,
    url: U('photo-1558981806-ec527fa84c39') },
  { match: /\b(caminhao|caminhonete|pickup)\b/i,
    url: U('photo-1601584115197-04ecc0da31d7') },
  { match: /\b(bicicleta|bike|ciclismo|mountain bike)\b/i,
    url: U('photo-1485965120184-e220f721d03e') },
  { match: /\b(patinete|skate)\b/i,
    url: U('photo-1565033041207-d35f6b51b1bc') },
  { match: /\b(mecanico|funilaria|oficina automotiva|lavagem de carro)\b/i,
    url: U('photo-1632823469850-1b7b1e8b7e9d') },

  // ── Esportes / lazer ──
  { match: /\b(futebol|bola|chuteira)\b/i,
    url: U('photo-1614632537423-1e6c2e7e0aac') },
  { match: /\b(viagem|passagem|hotel|pousada|airbnb|excursao)\b/i,
    url: U('photo-1488646953014-85cb44e25828') },

  // ── Comida / bebida ──
  { match: /\b(pizza|pizzaria)\b/i,
    url: U('photo-1565299624946-b28f40a0ae38') },
  { match: /\b(hamburguer|hamburgueria|burger)\b/i,
    url: U('photo-1568901346375-23c9450c58cd') },
  { match: /\b(bolo|confeitaria|doceria|brigadeiro|cupcake)\b/i,
    url: U('photo-1565958011703-44f9829ba187') },
  { match: /\b(comida|restaurante|lanche|delivery|food|marmita)\b/i,
    url: U('photo-1546069901-ba9599a7e63c') },
  { match: /\b(cafe|coffee|barista|cafeteria)\b/i,
    url: U('photo-1495474472287-4d71bcdd2085') },
  { match: /\b(cerveja|cervejaria)\b/i,
    url: U('photo-1535958636474-b021ee887b13') },
  { match: /\b(vinho|wine)\b/i,
    url: U('photo-1510812431401-41d2bd2722f3') },
  { match: /\b(drink|coquetel|bar)\b/i,
    url: U('photo-1551024709-8f23befc6f87') },
  { match: /\b(sushi|japones|temaki)\b/i,
    url: U('photo-1579871494447-9811cf80d66c') },

  // ── Serviços diversos ──
  { match: /\b(fotografo|ensaio fotografico|pre-wedding|book fotografico)\b/i,
    url: U('photo-1554080353-a576cf803bda') },
  { match: /\b(festa|aniversario|decoracao de festa|bolo de festa|salgadinhos)\b/i,
    url: U('photo-1492684223066-81342ee5ff30') },
  { match: /\b(buffet|catering)\b/i,
    url: U('photo-1555244162-803834f70033') },
  { match: /\b(dj|musica ao vivo|cantor|cantora|banda)\b/i,
    url: U('photo-1571266028253-6c1f1a8d68f1') },
  { match: /\b(consultoria|coach|coaching|mentoria)\b/i,
    url: U('photo-1521737604893-d14cc237f11d') },
  { match: /\b(marketing digital|trafego pago|gestao de redes sociais|social media)\b/i,
    url: U('photo-1432888622747-4eb9a8efeb07') },
  { match: /\b(design grafico|logo|logotipo|identidade visual)\b/i,
    url: U('photo-1626785774573-4b799315345d') },
  { match: /\b(site|wordpress|landing page|loja virtual|desenvolvedor|programador)\b/i,
    url: U('photo-1517694712202-14dd9538aa97') },
  { match: /\b(advogado|advocacia|juridico|direito)\b/i,
    url: U('photo-1589994965851-a8f479c573a9') },
  { match: /\b(contador|contabilidade|imposto de renda)\b/i,
    url: U('photo-1554224155-6726b3ff858f') },

  // ── Tipos específicos da plataforma ──
  { match: /\b(amostra|amostras|sample|teste gratis|degustacao)\b/i,
    url: U('photo-1556909114-f6e7ad7d3136') },
  { match: /\b(promocao|promoçao|promoção|desconto|oferta especial)\b/i,
    url: U('photo-1607082348824-0a96f2a4b9da') },
];

const CATEGORY_PHOTOS: Record<string, string> = {
  'Eletrônicos':       U('photo-1518770660439-4636190af475'),
  'Games':             U('photo-1493711662062-fa541adb3fc8'),
  'Computadores':      U('photo-1496181133206-80ce9b88a853'),
  'Celulares':         U('photo-1511707171634-5f897ff02aa9'),
  'Áudio':             U('photo-1505740420928-5e560c06d30e'),
  'Roupas':            U('photo-1521572163474-6864f9cf17ab'),
  'Calçados':          U('photo-1542291026-7eec264c27ff'),
  'Acessórios':        U('photo-1515562141207-7a88fb7ce338'),
  'Bolsas & Mochilas': U('photo-1553062407-98eeb64c6a62'),
  'Relógios':          U('photo-1523275335684-37898b6baf30'),
  'Esportes':          U('photo-1614632537423-1e6c2e7e0aac'),
  'Livros':            U('photo-1512820790803-83ca734da794'),
  'Casa & Decoração':  U('photo-1555041469-a586c61ea9bc'),
  'Beleza':            U('photo-1487412947147-5cebf100ffc2'),
  'Infantil':          U('photo-1558877385-81a1c7e67d72'),
  'Automóveis':        U('photo-1542362567-b07e54358753'),
  'Moto':              U('photo-1558981806-ec527fa84c39'),
  'Carro':             U('photo-1542362567-b07e54358753'),
  'Caminhão':          U('photo-1601584115197-04ecc0da31d7'),
  'Animais':           U('photo-1561037404-61cd46aa615b'),
  'Cachorro':          U('photo-1561037404-61cd46aa615b'),
  'Gato':              U('photo-1514888286974-6c03e2ca1dba'),
  'Serviços':          U('photo-1521737604893-d14cc237f11d'),
  'Serviço':           U('photo-1521737604893-d14cc237f11d'),
  'Produto':           U('photo-1556909114-f6e7ad7d3136'),
  'Outros':            U('photo-1518770660439-4636190af475'),
};

// Genérico — quando nem keyword nem categoria batem
const DEFAULT_PHOTO = U('photo-1556909114-f6e7ad7d3136');

export function inferPhotoUrl(text: string, category?: string): string {
  const t = (text || '').toLowerCase();
  for (const { match, url } of KEYWORD_PHOTOS) {
    if (match.test(t)) return url;
  }
  if (category && CATEGORY_PHOTOS[category]) return CATEGORY_PHOTOS[category];
  return DEFAULT_PHOTO;
}

export function buildPlaceholderDataUrl({ title, description, category }: { title?: string; description?: string; category?: string }): string {
  const text = `${title || ''} ${description || ''}`.trim();
  return inferPhotoUrl(text, category);
}

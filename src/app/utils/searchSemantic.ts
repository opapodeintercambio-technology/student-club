/**
 * Mapeamento semântico para busca por categoria/tipo de produto.
 * Quando o usuário digita um termo genérico (ex: "moto"), expande para
 * todos os termos relacionados (marcas, modelos, sinônimos) que podem
 * aparecer nos títulos/descrições dos anúncios.
 */

const SEMANTIC_MAP: Record<string, string[]> = {
  // Motos
  moto: ['moto', 'motocicleta', 'bike', 'titan', 'cg', 'biz', 'pop', 'fan', 'lead', 'pcx', 'fazer', 'lander', 'mt07', 'mt-07', 'mt09', 'mt-09', 'cb500', 'cb300', 'cb600', 'hornet', 'xre', 'nx', 'bros', 'nxr', 'twister', 'crosser', 'ténéré', 'tenere', 'r1', 'r3', 'r6', 'ninja', 'z300', 'z400', 'z650', 'z900', 'gsx', 'bandit', 'vstrom', 'burgman', 'ducati', 'panigale', 'monster', 'multistrada', 'harley', 'davidson', 'sportster', 'softail', 'touring', 'bmw', 'gs', 'f800', 'f750', 'r1200', 'r1250', 'triumph', 'bonneville', 'tiger', 'street triple', 'ktm', 'adventure', 'duke', 'honda', 'yamaha', 'kawasaki', 'suzuki', 'scooter', 'cilindrada'],

  // Celulares/Smartphones
  celular: ['celular', 'smartphone', 'iphone', 'samsung', 'galaxy', 'motorola', 'moto g', 'moto e', 'xiaomi', 'redmi', 'poco', 'realme', 'oppo', 'oneplus', 'huawei', 'lg', 'sony', 'xperia', 'nokia', 'google pixel', 'pixel', 'android', 'ios', 'apple', 'phone', 'telefone'],
  iphone: ['iphone', 'apple', 'ios', 'celular apple'],
  samsung: ['samsung', 'galaxy', 'android samsung'],

  // Computadores / Notebooks
  notebook: ['notebook', 'laptop', 'computador', 'pc', 'macbook', 'mac', 'apple mac', 'lenovo', 'thinkpad', 'ideapad', 'dell', 'inspiron', 'xps', 'alienware', 'hp', 'pavilion', 'envy', 'spectre', 'asus', 'rog', 'zenbook', 'acer', 'aspire', 'predator', 'microsoft', 'surface', 'chromebook', 'ultrabook', 'gamer', 'gaming'],
  computador: ['computador', 'desktop', 'pc', 'torre', 'monitor', 'notebook', 'laptop', 'processador', 'i5', 'i7', 'i9', 'ryzen', 'amd', 'intel'],
  mac: ['mac', 'macbook', 'imac', 'mac mini', 'mac pro', 'apple', 'm1', 'm2', 'm3'],

  // Games / Consoles
  playstation: ['playstation', 'ps5', 'ps4', 'ps3', 'sony', 'console', 'game', 'videogame'],
  xbox: ['xbox', 'microsoft', 'series x', 'series s', 'one', 'console', 'game'],
  nintendo: ['nintendo', 'switch', 'wii', 'ds', '3ds', 'game boy', 'console'],
  game: ['game', 'jogo', 'jogos', 'videogame', 'console', 'playstation', 'xbox', 'nintendo', 'switch', 'ps4', 'ps5', 'gamer'],

  // TVs
  tv: ['tv', 'televisao', 'televisão', 'smart tv', 'television', 'oled', 'qled', 'led', 'samsung tv', 'lg tv', 'sony tv', 'philips', 'tcl', 'aoc', 'monitor'],

  // Roupas
  roupa: ['roupa', 'roupas', 'camiseta', 'camisa', 'blusa', 'casaco', 'jaqueta', 'moletom', 'calça', 'short', 'bermuda', 'vestido', 'saia', 'blazer', 'terno', 'polo', 'regata', 'legging', 'moda', 'fashion', 'nike', 'adidas', 'puma', 'lacoste', 'tommy', 'gucci', 'zara', 'h&m', 'levis', 'reserva', 'farm', 'animale'],

  // Tênis / Calçados
  tenis: ['tênis', 'tenis', 'calçado', 'sapato', 'sandália', 'bota', 'sapatilha', 'nike', 'adidas', 'vans', 'converse', 'all star', 'new balance', 'jordan', 'air max', 'ultraboost', 'yeezy', 'puma', 'fila', 'reebok', 'havaianas', 'crocs', 'dr martens', 'timberland', 'birkenstock', 'schutz', 'arezzo'],
  sapato: ['sapato', 'calçado', 'tênis', 'tenis', 'sandália', 'bota', 'sapatilha', 'oxford', 'loafer', 'mocassim'],

  // Bolsas
  bolsa: ['bolsa', 'mochila', 'carteira', 'bag', 'pochete', 'tote', 'clutch', 'gucci', 'louis vuitton', 'lv', 'chanel', 'prada', 'michael kors', 'coach', 'tory burch', 'furla', 'herschel', 'fjallraven', 'kanken', 'nike bag', 'adidas bag'],
  mochila: ['mochila', 'bolsa', 'bag', 'herschel', 'fjallraven', 'kanken', 'samsonite', 'nike', 'adidas', 'puma', 'escolar'],

  // Relógios
  relogio: ['relógio', 'relogio', 'watch', 'smartwatch', 'apple watch', 'samsung watch', 'galaxy watch', 'garmin', 'casio', 'g-shock', 'rolex', 'omega', 'tag heuer', 'seiko', 'tissot', 'fossil', 'fitbit', 'amazfit', 'xiaomi band', 'mi band'],

  // Carros / Automóveis
  carro: ['carro', 'automóvel', 'automovel', 'veículo', 'veiculo', 'sedan', 'hatch', 'suv', 'pickup', 'caminhonete', 'volkswagen', 'vw', 'fiat', 'chevrolet', 'gm', 'ford', 'honda', 'toyota', 'hyundai', 'renault', 'peugeot', 'citroen', 'jeep', 'ram', 'nissan', 'mitsubishi', 'kia', 'bmw car', 'mercedes', 'audi', 'volvo', 'polo', 'gol', 'hb20', 'onix', 'argo', 'pulse', 'renegade', 'compass', 'corolla', 'civic', 'hrv', 'crv'],

  // Bicicletas
  bicicleta: ['bicicleta', 'bike', 'ciclismo', 'mtb', 'mountain bike', 'speed', 'road bike', 'trek', 'caloi', 'oggi', 'sense', 'specialized', 'giant', 'cannondale', 'scott', 'aro 29', 'aro 26'],

  // Eletrônicos
  eletronico: ['eletrônico', 'eletronico', 'tablet', 'ipad', 'kindle', 'e-reader', 'câmera', 'camera', 'dji', 'drone', 'gopro', 'fone', 'headphone', 'airpods', 'jbl', 'speaker', 'caixa de som', 'projetor', 'impressora', 'scanner'],
  fone: ['fone', 'headphone', 'headset', 'earphone', 'airpods', 'galaxy buds', 'jbl', 'sony', 'sennheiser', 'beats', 'bose', 'fone bluetooth', 'sem fio', 'wireless'],
  tablet: ['tablet', 'ipad', 'samsung tab', 'galaxy tab', 'lenovo tab', 'kindle', 'e-reader', 'android tablet'],

  // Esportes
  esporte: ['esporte', 'sport', 'futebol', 'bola', 'chuteira', 'fitness', 'musculação', 'musculacao', 'haltere', 'peso', 'academia', 'natação', 'natacao', 'tênis esporte', 'vôlei', 'volei', 'basquete', 'surf', 'prancha', 'skate', 'patins', 'corrida', 'running'],

  // Móveis
  movel: ['móvel', 'movel', 'mobília', 'mobilia', 'sofá', 'sofa', 'cama', 'mesa', 'cadeira', 'guarda-roupa', 'armário', 'armario', 'estante', 'rack', 'cômoda', 'comoda', 'escrivaninha', 'beliche'],

  // Eletrodomésticos
  eletrodomestico: ['eletrodoméstico', 'eletrodomestico', 'geladeira', 'fogão', 'fogao', 'microondas', 'lavadora', 'máquina de lavar', 'maquina de lavar', 'secadora', 'lava-louças', 'ar condicionado', 'ventilador', 'liquidificador', 'batedeira', 'fritadeira', 'airfryer'],

  // Livros
  livro: ['livro', 'livros', 'book', 'literatura', 'romance', 'ficção', 'ficcao', 'mangá', 'manga', 'quadrinho', 'hq', 'infanto', 'técnico', 'tecnico', 'acadêmico', 'academico', 'kindle', 'box'],

  // Instrumentos Musicais
  instrumento: ['instrumento', 'guitarra', 'violão', 'violao', 'piano', 'teclado', 'bateria', 'baixo', 'fender', 'gibson', 'yamaha', 'roland', 'amplificador', 'amp', 'pedal', 'efeito', 'microfone', 'mic', 'ukulele', 'violino', 'saxofone', 'trompete', 'flauta'],
  guitarra: ['guitarra', 'violão', 'violao', 'instrumento de corda', 'fender', 'gibson', 'ibanez', 'les paul', 'stratocaster', 'telecaster'],
};

/**
 * Expande o termo de busca para incluir termos semanticamente relacionados.
 * Retorna um conjunto de termos que devem ser verificados.
 */
export function expandSearchTerms(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Sempre inclui o termo original
  const terms = new Set<string>([q]);

  // Procura em todas as chaves e valores do mapa
  for (const [key, values] of Object.entries(SEMANTIC_MAP)) {
    // Se o query bate com a chave ou qualquer valor do grupo
    const keyMatch = key.includes(q) || q.includes(key);
    const valueMatch = values.some(v => v.includes(q) || q.includes(v));

    if (keyMatch || valueMatch) {
      // Adiciona todos os termos do grupo
      values.forEach(v => terms.add(v));
      terms.add(key);
    }
  }

  return Array.from(terms);
}

/**
 * Verifica se um produto corresponde à busca semântica.
 */
export function productMatchesSearch(product: { title: string; description: string; category: string; wantsInExchange: string }, query: string): boolean {
  if (!query.trim()) return true;

  const terms = expandSearchTerms(query);
  const searchable = `${product.title} ${product.description} ${product.category} ${product.wantsInExchange}`.toLowerCase();

  return terms.some(term => searchable.includes(term));
}

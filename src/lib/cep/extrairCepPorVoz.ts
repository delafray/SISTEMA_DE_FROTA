export function extrairCepDeTranscricao(texto: string): string | null {
  if (!texto) return null;

  const mapNumeros: Record<string, string> = {
    'zero': '0',
    'um': '1', 'uma': '1',
    'dois': '2', 'duas': '2',
    'três': '3', 'tres': '3',
    'quatro': '4',
    'cinco': '5',
    'seis': '6', 'meia': '6',
    'sete': '7',
    'oito': '8',
    'nove': '9'
  };

  // Divide o texto em tokens, removendo hifens e pontuações comuns
  const tokens = texto.toLowerCase().replace(/[,.-]/g, ' ').split(/\s+/);
  
  let cep = '';
  for (const token of tokens) {
    if (mapNumeros[token] !== undefined) {
      cep += mapNumeros[token];
    } else if (/^\d+$/.test(token)) {
      cep += token;
    }
  }

  if (cep.length === 8) {
    return cep;
  }
  
  return null;
}

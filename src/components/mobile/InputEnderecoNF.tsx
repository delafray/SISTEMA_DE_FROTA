'use client';

/**
 * InputEnderecoNF — fluxo de captura de uma NF (telas mínimas):
 *
 *   CEP digitado: 1. CEP → 2. CONFIRMAR (endereco + campo de numero + botao
 *                 "Confirmar e proxima" na MESMA tela)
 *   Por VOZ:      1. fala "Afonso Pena 341" → 2. ESCOLHA (cards ja com
 *                 numero+CEP) → 3. CONFIRMAR (numero ja pre-preenchido da fala)
 *
 * A tela CONFIRMAR e unica pros dois caminhos: mostra o endereco, um campo de
 * numero editavel (vazio quando nao se sabe o numero — o botao confirma fica
 * desabilitado ate digitar) e o badge de validacao do numero contra o OSM
 * (debounce, nao bloqueia).
 *
 * Fallback: se ViaCEP nao encontrar o CEP, abre form manual de endereco
 * (logradouro/bairro/cidade/uf).
 *
 * Mobile-first: inputMode numeric, foco automatico entre telas, vibracao
 * tatil na confirmacao, botoes grandes pra dedo gordo.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.7 (mockups visuais).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { consultarCEPBrowser } from '@/lib/cep/client';
import type { EnderecoCEP } from '@/lib/cep/types';
import type { ResultadoGeocoding } from '@/lib/routing/types';
import { calcularDistanciaKm } from '@/lib/routing/geocoding';
import { BotaoMicrofone } from './BotaoMicrofone';
import { BotaoCamera } from './BotaoCamera';
import { extrairEnderecoDeOCR } from '@/lib/ocr/extrairEnderecoDeOCR';
import { encerrarOcr, type ResultadoOCR } from '@/lib/ocr/lerImagem';
import { extrairCepDeTranscricao } from '@/lib/cep/extrairCepPorVoz';
import { extrairNumeroDeTranscricao } from '@/lib/cep/extrairNumeroPorVoz';
import { ListaOpcoesEndereco } from './ListaOpcoesEndereco';
import { vibrar } from '@/lib/mobile/dispositivo';
import { cores } from '@/lib/mobile/ui';

// ─── TIPOS ──────────────────────────────────────────────────────────

export interface NotaCapturadaInput {
  cep: string;              // 8 digitos sem hifen
  numero: string;
  endereco: EnderecoCEP;
  observacao?: string;
}

export interface InputEnderecoNFProps {
  numeroNF: number;         // contador da UI: "24" em "24 de 70"
  /** Total esperado. Se omitido (motorista nao sabe o total), header mostra so "NF X". */
  totalNFs?: number;
  onConfirmar: (nota: NotaCapturadaInput) => void | Promise<void>;
  onCancelar?: () => void;
  /** Se fornecido, mostra botão "↶ Desfazer última" no topo. Volta o estado
   *  do app removendo a ultima NF capturada (logica fica no parent). */
  onDesfazerUltima?: () => void | Promise<void>;
  /** Dados iniciais para modo de edição. Quando fornecido, campos já começam preenchidos. */
  initialData?: NotaCapturadaInput;
}

type Etapa = 'cep' | 'confirmar' | 'endereco_manual' | 'escolha_endereco';

// ─── HELPERS ────────────────────────────────────────────────────────

function normalizar(cep: string): string {
  return cep.replace(/\D/g, '');
}

/** Formata enquanto digita: '01310-100' partindo de '01310100'. */
function formatarCEP(digitsApenas: string): string {
  const d = digitsApenas.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ─── COMPONENTE ─────────────────────────────────────────────────────

export function InputEnderecoNF({
  numeroNF,
  totalNFs,
  onConfirmar,
  onCancelar,
  onDesfazerUltima,
  initialData,
}: InputEnderecoNFProps): React.ReactElement {
  const [etapa, setEtapa] = useState<Etapa>(initialData ? 'confirmar' : 'cep');
  const [cep, setCep] = useState<string>(initialData?.cep ?? '');           // armazenado normalizado (so digitos)
  const [endereco, setEndereco] = useState<EnderecoCEP | null>(initialData?.endereco ?? null);
  const [numero, setNumero] = useState<string>(initialData?.numero ?? '');
  const [loading, setLoading] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  // Validacao do numero via Overpass (rodada na etapa 'confirmar', nao bloqueia)
  const [validacao, setValidacao] = useState<null | {
    status: 'confirmado' | 'plausivel' | 'suspeito' | 'sem_dados' | 'carregando';
    mensagem?: string;
  }>(null);
  // Lista de opcoes de geocoding para o motorista escolher
  const [opcoesFala, setOpcoesFala] = useState<(ResultadoGeocoding & { distanciaKm?: number })[]>([]);
  // Texto bruto que o motorista falou — guardado pra extrair o numero da casa
  // na hora que ele escolher a opcao (Nominatim raramente devolve house_number).
  const [textoFala, setTextoFala] = useState<string>('');
  // OCR (foto da nota): estado de leitura + dica de reenquadramento/conferencia.
  const [ocrLendo, setOcrLendo] = useState(false);
  const [ocrDica, setOcrDica] = useState<string | null>(null);

  const numeroRef = useRef<HTMLInputElement | null>(null);

  // Libera o worker de OCR (WASM + dicionário em memória) ao sair da captura.
  useEffect(() => {
    return () => {
      void encerrarOcr();
    };
  }, []);

  // Quando CEP atinge 8 digitos, dispara ViaCEP automaticamente.
  useEffect(() => {
    if (etapa !== 'cep') return;
    if (cep.length !== 8) return;

    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErro(null);

    consultarCEPBrowser(cep).then((resultado) => {
      if (cancelado) return;
      setLoading(false);

      if (resultado.ok) {
        setEndereco(resultado.endereco);
        // CEP nao traz numero da casa — vai direto pra tela de confirmar, que
        // ja tem o campo de numero (vazio, focado). Uma tela a menos.
        setEtapa('confirmar');
        setTimeout(() => numeroRef.current?.focus(), 50);
        return;
      }

      // Tratamento de erros
      if (resultado.motivo === 'nao_encontrado') {
        setErro('CEP nao encontrado. Preencha o endereco manualmente.');
        setEtapa('endereco_manual');
      } else if (resultado.motivo === 'erro_rede' || resultado.motivo === 'timeout') {
        setErro('Erro de conexao. Tente novamente ou preencha manualmente.');
      } else {
        setErro('CEP invalido.');
      }
    });

    return () => {
      cancelado = true;
    };
  }, [cep, etapa]);

  const [buscandoEndereco, setBuscandoEndereco] = useState<boolean>(false);

  // Valida o numero contra o OSM via API server-side. Roda na etapa 'confirmar'
  // quando ha numero. Como o numero agora e editavel nessa mesma tela, usamos
  // DEBOUNCE (700ms) pra so validar quando o motorista para de digitar — senao
  // dispararia uma chamada ao Overpass a cada tecla. Nunca bloqueia o fluxo.
  useEffect(() => {
    if (etapa !== 'confirmar' || !endereco || !numero.trim() || !cep) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValidacao(null);
      return;
    }
    let cancelado = false;
    setValidacao({ status: 'carregando' });

    const timer = setTimeout(() => {
      fetch('/api/routing/validar-endereco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cep, numero, endereco }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { status?: string; mensagem?: string } | null) => {
          if (cancelado) return;
          if (!data || !data.status) {
            setValidacao(null);
            return;
          }
          setValidacao({
            status: data.status as 'confirmado' | 'plausivel' | 'suspeito' | 'sem_dados',
            mensagem: data.mensagem,
          });
        })
        .catch(() => {
          if (!cancelado) setValidacao(null);
        });
    }, 700);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [etapa, endereco, numero, cep]);

  const handleTranscricao = useCallback(async (texto: string) => {
    // 1. Tenta extrair CEP direto
    const cepExtraido = extrairCepDeTranscricao(texto);
    if (cepExtraido) {
      setCep(cepExtraido);
      return;
    }

    // 2. Se não extraiu CEP, tenta geocodar o endereço livre
    if (texto.trim().length < 5) return; // Muito curto

    setBuscandoEndereco(true);
    setErro(null);

    try {
      // Tenta obter localização do usuário para ordenar por proximidade
      let userLat: number | undefined;
      let userLng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation?.getCurrentPosition(resolve, reject, {
            timeout: 3000,
            maximumAge: 60000,
          });
        });
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
      } catch {
        // Sem GPS ou sem permissão — geocoda sem coordenadas
      }

      // Monta URL com coordenadas se disponíveis
      const params = new URLSearchParams({ q: texto, limite: '5' });
      if (userLat !== undefined && userLng !== undefined) {
        params.set('lat', String(userLat));
        params.set('lng', String(userLng));
      }

      const res = await fetch(`/api/routing/geocodar?${params.toString()}`);
      const data = await res.json() as { resultados?: ResultadoGeocoding[] };

      if (res.ok && data.resultados && data.resultados.length > 0) {
        // Anota distância pra cada opção
        const comDistancia = data.resultados.map((r) => ({
          ...r,
          distanciaKm:
            userLat !== undefined && userLng !== undefined
              ? calcularDistanciaKm(userLat, userLng, r.lat, r.lng)
              : undefined,
        }));

        // SEMPRE mostra a lista (mesmo com 1 resultado) — motorista precisa
        // confirmar visualmente que e o endereco certo. Antes preenchia direto
        // quando vinha so 1 e o motorista nem via o que o Nominatim escolheu.
        setTextoFala(texto); // guarda a fala pra extrair o numero na selecao
        setOpcoesFala(comDistancia);
        setEtapa('escolha_endereco');
      } else {
        setErro('Não encontrei esse endereço. Tente novamente ou use o CEP.');
      }
    } catch {
      setErro('Erro ao buscar endereço falado.');
    } finally {
      setBuscandoEndereco(false);
    }
  }, []);

  /** Preenche estado de endereço a partir de um resultado de geocoding.
   *  Usa os campos estruturados (logradouro/bairro/cidade/uf) parseados do
   *  Nominatim — antes o display_name inteiro virava logradouro e os demais
   *  ficavam vazios, parada salvava sem bairro/cidade.
   *
   *  Fusao das etapas (voz): o motorista falou "Afonso Pena 341", escolheu o
   *  card e vai direto pra 'confirmar' com o numero ja preenchido (da fala ou
   *  do Nominatim). Quando nao ha numero, o campo na tela de confirmar nasce
   *  vazio e focado — sem tela extra. */
  function preencherPorGeocodingResultado(resultado: ResultadoGeocoding, textoOriginal: string) {
    setEndereco({
      logradouro: resultado.logradouro || resultado.endereco_normalizado.split(',')[0]?.trim() || '',
      bairro: resultado.bairro ?? '',
      cidade: resultado.cidade ?? '',
      uf: resultado.uf ?? '',
    });
    // Preferencia: numero estruturado do Nominatim > extracao do texto falado.
    // Nominatim raramente devolve house_number pra ruas BR, entao o caminho
    // normal e extrair da fala (ultimo run de digitos).
    const numeroFinal = resultado.numero || extrairNumeroDeTranscricao(textoOriginal) || '';
    setNumero(numeroFinal);
    // Tambem preenche o CEP se Nominatim devolveu
    if (resultado.cep && /^\d{8}$/.test(resultado.cep)) {
      setCep(resultado.cep);
    }
    setEtapa('confirmar');
    // Sem numero pra mostrar → foca o campo pra digitar na hora.
    if (!numeroFinal.trim()) {
      setTimeout(() => numeroRef.current?.focus(), 50);
    }
  }

  // OCR: recebe o texto da foto, extrai endereço e preenche o fluxo existente.
  // CEP achado → setCep dispara o ViaCEP (mesmo caminho do CEP digitado).
  // Sem CEP → orienta reenquadrar no bloco do destinatário (decisão de UX do dono).
  const handleOcrTexto = useCallback((resultado: ResultadoOCR) => {
    setErro(null);
    setOcrDica(null);
    const ext = extrairEnderecoDeOCR(resultado.texto);

    if (ext.cep) {
      if (ext.numero) setNumero(ext.numero); // pré-preenche o número (driver confirma)
      setCep(ext.cep);                       // dispara o useEffect do ViaCEP → 'confirmar'
      if (resultado.confianca && resultado.confianca < 60) {
        setOcrDica('Leitura com baixa qualidade — confira o endereço antes de confirmar.');
      } else if (ext.cepsEncontrados.length > 1) {
        setOcrDica('A nota tinha mais de um CEP — usei o do destinatário. Confira o endereço.');
      }
      return;
    }
    // Sem CEP: aceita a foto inteira, mas pede pra aproximar do bloco de endereço.
    setOcrDica(
      'Não achei o CEP na foto. Aproxime a câmera do bloco do DESTINATÁRIO (endereço de entrega) e tente de novo — ou digite/fale o CEP.'
    );
  }, []);

  const handleCepChange = useCallback((valor: string) => {
    setCep(normalizar(valor));
    setErro(null);
    setOcrDica(null);
  }, []);

  const handleConfirmar = useCallback(async () => {
    // CEP e opcional: ruas/avenidas longas nao tem 1 CEP unico (ViaCEP marcou
    // cepMultiplos) — o pino no mapa e resolvido por rua+cidade+numero. So o
    // numero e obrigatorio.
    if (!endereco || !numero.trim()) return;
    vibrar(50);
    await onConfirmar({ cep, numero, endereco });
    // Reset pra proxima NF
    setCep('');
    setNumero('');
    setEndereco(null);
    setEtapa('cep');
    setErro(null);
  }, [cep, numero, endereco, onConfirmar]);

  const handleVoltarParaCep = useCallback(() => {
    setCep('');
    setNumero('');
    setEndereco(null);
    setValidacao(null);
    setErro(null);
    setEtapa('cep');
  }, []);

  const handleCancelarNota = useCallback(() => {
    setCep('');
    setNumero('');
    setEndereco(null);
    setEtapa('cep');
    setErro(null);
    onCancelar?.();
  }, [onCancelar]);

  // ─── RENDER ────────────────────────────────────────────────────────

  const cabecalho = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: cores.textoFraco }}>
        NF {numeroNF}{totalNFs && totalNFs > 0 ? ` de ${totalNFs}` : ''}
      </div>
      {onDesfazerUltima && numeroNF > 1 && (
        <button
          type="button"
          onClick={() => onDesfazerUltima()}
          aria-label="desfazer ultima NF"
          style={{
            background: 'transparent',
            border: `1px solid ${cores.bordaForte}`,
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: cores.textoFraco,
            cursor: 'pointer',
          }}
        >
          ↶ Desfazer última
        </button>
      )}
    </div>
  );

  if (etapa === 'cep') {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <label style={labelStyle} htmlFor="campo-cep">CEP</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            id="campo-cep"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="postal-code"
            value={formatarCEP(cep)}
            onChange={(e) => handleCepChange(e.target.value)}
            placeholder="00000-000"
            maxLength={9}
            autoFocus
            style={{ ...inputStyle, flex: 1 }}
            aria-label="CEP"
          />
          <BotaoMicrofone onTranscricao={handleTranscricao} disabled={loading || buscandoEndereco || ocrLendo} />
          <BotaoCamera
            onTexto={handleOcrTexto}
            onLendoChange={setOcrLendo}
            onErro={(m) => setOcrDica(m)}
            disabled={loading || buscandoEndereco || ocrLendo}
          />
        </div>
        <div style={{ fontSize: 13, color: cores.textoFraco, marginTop: 12, textAlign: 'center' }}>
          Fale 🎤 &quot;Rua Augusta 1500&quot; ou fotografe 📷 a nota
        </div>

        {ocrLendo && <div role="status" data-testid="ocr-lendo" style={{ marginTop: 12, color: cores.azul, textAlign: 'center', fontWeight: 600 }}>📷 Lendo a nota… aguarde</div>}
        {ocrDica && <div role="status" data-testid="ocr-dica" style={dicaOcrStyle}>{ocrDica}</div>}
        {buscandoEndereco && <div style={{ marginTop: 12, color: cores.azul, textAlign: 'center', fontWeight: 600 }}>🔍 Buscando endereço...</div>}
        {loading && <div style={{ marginTop: 12, color: cores.textoFraco, textAlign: 'center' }}>Consultando CEP…</div>}
        {erro && <div role="alert" style={erroStyle}>{erro}</div>}
        {onCancelar && (
          <button type="button" onClick={onCancelar} style={botaoSecundarioStyle}>
            Cancelar
          </button>
        )}
      </div>
    );
  }

  if (etapa === 'escolha_endereco') {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <ListaOpcoesEndereco
          opcoes={opcoesFala}
          numeroFala={extrairNumeroDeTranscricao(textoFala) ?? undefined}
          onSelecionar={(opcao) => {
            preencherPorGeocodingResultado(opcao, textoFala);
            setOpcoesFala([]);
            setTextoFala('');
          }}
          onNenhumDesses={() => {
            setOpcoesFala([]);
            setCep('');
            setEndereco(null);
            setErro(null);
            setEtapa('cep');
          }}
        />
      </div>
    );
  }

  // Tela unica de revisar+confirmar: endereco + campo de numero editavel +
  // badge de validacao + confirmar de uma vez. Pros dois caminhos (CEP e voz).
  if (etapa === 'confirmar' && endereco) {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Confirmar?</div>
        <div style={enderecoBoxStyle}>
          📍 <strong>{endereco.logradouro || '(sem nome de rua)'}{numero.trim() ? `, ${numero.trim()}` : ''}</strong>
          <br />
          <span style={{ fontSize: 14, color: cores.textoMedio }}>
            {endereco.bairro && `${endereco.bairro}, `}{endereco.cidade}/{endereco.uf}
            {cep && (
              <>
                <br />
                CEP {formatarCEP(cep)}
              </>
            )}
          </span>
        </div>
        <label style={labelStyle} htmlFor="campo-numero">Numero</label>
        <input
          ref={numeroRef}
          id="campo-numero"
          type="text"
          inputMode="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="123 ou S/N"
          maxLength={20}
          style={inputStyle}
          aria-label="Numero"
        />
        {validacao && <BadgeValidacao status={validacao.status} mensagem={validacao.mensagem} />}
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={!numero.trim()}
          style={{ ...botaoPrimarioStyle, opacity: numero.trim() ? 1 : 0.4 }}
        >
          ✅ Confirmar e proxima
        </button>
        <button type="button" onClick={handleVoltarParaCep} style={botaoSecundarioStyle}>
          ← Voltar (trocar endereco)
        </button>
        <button type="button" onClick={handleCancelarNota} style={{ ...botaoSecundarioStyle, color: cores.vermelho }}>
          ❌ Cancelar esta NF
        </button>
      </div>
    );
  }

  // Fallback: CEP nao encontrado → form manual
  if (etapa === 'endereco_manual') {
    return (
      <div style={containerStyle}>
        {cabecalho}
        <div role="alert" style={erroStyle}>{erro ?? 'Preencha o endereco manualmente.'}</div>
        <FormEnderecoManual
          cepInicial={cep}
          onPreencher={(end) => {
            setEndereco(end);
            setEtapa('confirmar');
            setTimeout(() => numeroRef.current?.focus(), 50);
          }}
          onVoltar={() => {
            // Reseta cep + endereco — senao useEffect de cep.length===8
            // re-dispara ViaCEP imediatamente e cai de novo em endereco_manual (loop).
            setCep('');
            setEndereco(null);
            setErro(null);
            setEtapa('cep');
          }}
        />
      </div>
    );
  }

  return <div style={containerStyle}>{cabecalho}<div>Carregando…</div></div>;
}

// ─── SUB-COMPONENTE: form manual ────────────────────────────────────

interface FormManualProps {
  cepInicial: string;
  onPreencher: (endereco: EnderecoCEP) => void;
  onVoltar: () => void;
}

function FormEnderecoManual({ cepInicial, onPreencher, onVoltar }: FormManualProps): React.ReactElement {
  const [logradouro, setLogradouro] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  const valido = cidade.trim().length > 0 && uf.trim().length === 2;

  return (
    <div>
      <div style={{ fontSize: 13, color: cores.textoFraco, marginBottom: 12 }}>
        CEP: <strong>{cepInicial}</strong>
      </div>
      <label style={labelStyle}>Logradouro</label>
      <input style={inputStyle} value={logradouro} onChange={(e) => setLogradouro(e.target.value)} aria-label="Logradouro" />
      <label style={labelStyle}>Bairro</label>
      <input style={inputStyle} value={bairro} onChange={(e) => setBairro(e.target.value)} aria-label="Bairro" />
      <label style={labelStyle}>Cidade</label>
      <input style={inputStyle} value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade" />
      <label style={labelStyle}>UF (2 letras)</label>
      <input
        style={inputStyle}
        value={uf}
        onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
        maxLength={2}
        aria-label="UF"
      />
      <button
        type="button"
        onClick={() => valido && onPreencher({ logradouro, bairro, cidade, uf })}
        disabled={!valido}
        style={{ ...botaoPrimarioStyle, opacity: valido ? 1 : 0.4 }}
      >
        → Usar este endereco
      </button>
      <button type="button" onClick={onVoltar} style={botaoSecundarioStyle}>
        ← Tentar outro CEP
      </button>
    </div>
  );
}

// ─── ESTILOS INLINE (mobile-first, sem dependencia de design system) ─

const containerStyle: React.CSSProperties = {
  padding: 16,
  maxWidth: 480,
  margin: '0 auto',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: cores.textoForte,
  marginTop: 12,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 12px',
  fontSize: 18,
  border: `1px solid ${cores.bordaForte}`,
  borderRadius: 8,
  boxSizing: 'border-box',
};

const enderecoBoxStyle: React.CSSProperties = {
  padding: 12,
  background: cores.divisoria,
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 15,
};

const botaoPrimarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  fontSize: 16,
  fontWeight: 600,
  background: cores.azul,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  marginTop: 16,
};

const botaoSecundarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: 14,
  background: 'transparent',
  color: cores.textoMedio,
  border: 'none',
  cursor: 'pointer',
  marginTop: 8,
};

const erroStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: cores.fundoVermelho,
  color: cores.vermelhoTexto,
  borderRadius: 6,
  fontSize: 14,
};

// Dica do OCR (reenquadrar / conferir) — informativa, tom âmbar, não bloqueia.
const dicaOcrStyle: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  background: cores.fundoAmbar,
  color: cores.textoAmbar,
  borderRadius: 6,
  fontSize: 13,
  lineHeight: 1.5,
};

// ─── BADGE DE VALIDACAO ────────────────────────────────────────────
// Mostra ao motorista o resultado da validacao de numero contra OSM.
// NUNCA bloqueia o fluxo — so informa. 4 status:
//   🟢 confirmado — numero exato achado no mapa
//   🟡 plausivel  — dentro da faixa conhecida, mas nao exato
//   🟠 suspeito   — fora da faixa (avisar com destaque)
//   ⚪ sem_dados   — rua sem cobertura — sem opinar
//   ⏳ carregando — validando agora

function BadgeValidacao({
  status,
  mensagem,
}: {
  status: 'confirmado' | 'plausivel' | 'suspeito' | 'sem_dados' | 'carregando';
  mensagem?: string;
}) {
  if (status === 'sem_dados') return null; // nada pra mostrar

  const config: Record<
    Exclude<typeof status, 'sem_dados'>,
    { icone: string; bg: string; border: string; cor: string; label: string }
  > = {
    confirmado: {
      icone: '🟢',
      bg: '#f0fdf4',
      border: '#86efac',
      cor: '#166534',
      label: 'Endereco confirmado no mapa',
    },
    plausivel: {
      icone: '🟡',
      bg: '#fefce8',
      border: '#fde047',
      cor: '#854d0e',
      label: mensagem ?? 'Numero plausivel (dentro da faixa, mas nao confirmado)',
    },
    suspeito: {
      icone: '🟠',
      bg: '#fff7ed',
      border: '#fdba74',
      cor: '#9a3412',
      label: mensagem ?? 'Numero suspeito — confirma?',
    },
    carregando: {
      icone: '⏳',
      bg: cores.divisoria,
      border: cores.bordaForte,
      cor: '#475569',
      label: 'Validando endereco...',
    },
  };
  const c = config[status as Exclude<typeof status, 'sem_dados'>];


  return (
    <div
      role="status"
      data-testid={`validacao-${status}`}
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.cor,
        borderRadius: 6,
        fontSize: 13,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icone}</span>
      <span style={{ flex: 1 }}>{c.label}</span>
    </div>
  );
}

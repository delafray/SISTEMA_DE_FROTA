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
import { extrairNumeroDeTranscricao } from '@/lib/cep/extrairNumeroPorVoz';
import { encerrarOcr } from '@/lib/ocr/lerImagem';
import { ListaOpcoesEndereco } from './ListaOpcoesEndereco';
import { vibrar } from '@/lib/mobile/dispositivo';
import { normalizarCEP } from '@/lib/cep/formatarCEP';
import { FormEnderecoManual } from './inputEnderecoNF/FormEnderecoManual';
import { CabecalhoNF } from './inputEnderecoNF/CabecalhoNF';
import { TelaCEP } from './inputEnderecoNF/TelaCEP';
import { TelaConfirmar, type StatusValidacao } from './inputEnderecoNF/TelaConfirmar';
import { useOcrState } from './inputEnderecoNF/useOcrState';
import { useTranscricaoEndereco, type OpcaoFala } from './inputEnderecoNF/useTranscricaoEndereco';
import { containerStyle, erroStyle } from './inputEnderecoNF/estilos';

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
  const [cep, setCep] = useState<string>(initialData?.cep ?? '');
  const [endereco, setEndereco] = useState<EnderecoCEP | null>(initialData?.endereco ?? null);
  const [numero, setNumero] = useState<string>(initialData?.numero ?? '');
  const [loading, setLoading] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [validacao, setValidacao] = useState<{ status: StatusValidacao; mensagem?: string } | null>(null);
  const [opcoesFala, setOpcoesFala] = useState<OpcaoFala[]>([]);
  // Texto bruto que o motorista falou — guardado pra extrair o numero da casa
  // na hora que ele escolher a opcao (Nominatim raramente devolve house_number).
  const [textoFala, setTextoFala] = useState<string>('');

  const numeroRef = useRef<HTMLInputElement | null>(null);

  // ─── OCR ──────────────────────────────────────────────────────────

  const { ocrFotos, ocrParcial, ocrDica, setOcrDica, ocrLendo, setOcrLendo, handleOcrTexto, handleContinuarComOcr, resetarOcr } =
    useOcrState({
      onCepLido: (cepLido, numeroLido) => {
        if (numeroLido) setNumero(numeroLido);
        setCep(cepLido); // dispara o useEffect do ViaCEP → 'confirmar'
      },
    });

  // Libera o worker de OCR (WASM + dicionário em memória) ao sair da captura.
  useEffect(() => { return () => { void encerrarOcr(); }; }, []);

  // ─── TRANSCRIÇÃO POR VOZ ───────────────────────────────────────────

  const { buscandoEndereco, handleTranscricao } = useTranscricaoEndereco({
    onCepExtraido: setCep,
    onOpcoesProntas: (opcoes, textoOriginal) => {
      setTextoFala(textoOriginal);
      setOpcoesFala(opcoes);
      setEtapa('escolha_endereco');
    },
    onErro: setErro,
  });

  // ─── EFEITO: CEP com 8 dígitos dispara ViaCEP ────────────────────

  useEffect(() => {
    if (etapa !== 'cep' || cep.length !== 8) return;
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErro(null);
    consultarCEPBrowser(cep).then((resultado) => {
      if (cancelado) return;
      setLoading(false);
      if (resultado.ok) {
        setEndereco(resultado.endereco);
        setEtapa('confirmar');
        setTimeout(() => numeroRef.current?.focus(), 50);
        return;
      }
      if (resultado.motivo === 'nao_encontrado') {
        setErro('CEP nao encontrado. Preencha o endereco manualmente.');
        setEtapa('endereco_manual');
      } else if (resultado.motivo === 'erro_rede' || resultado.motivo === 'timeout') {
        setErro('Erro de conexao. Tente novamente ou preencha manualmente.');
      } else {
        setErro('CEP invalido.');
      }
    });
    return () => { cancelado = true; };
  }, [cep, etapa]);

  // ─── EFEITO: validação do número via Overpass (debounce 700ms) ────
  // Nunca bloqueia o fluxo — só informa.

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
          if (!data?.status) { setValidacao(null); return; }
          setValidacao({ status: data.status as StatusValidacao, mensagem: data.mensagem });
        })
        .catch(() => { if (!cancelado) setValidacao(null); });
    }, 700);
    return () => { cancelado = true; clearTimeout(timer); };
  }, [etapa, endereco, numero, cep]);

  // ─── HANDLERS ─────────────────────────────────────────────────────

  /** Preenche estado de endereço a partir de um resultado de geocoding.
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
    const numeroFinal = resultado.numero || extrairNumeroDeTranscricao(textoOriginal) || '';
    setNumero(numeroFinal);
    if (resultado.cep && /^\d{8}$/.test(resultado.cep)) setCep(resultado.cep);
    setEtapa('confirmar');
    if (!numeroFinal.trim()) setTimeout(() => numeroRef.current?.focus(), 50);
  }

  /** Salva direto sem abrir a tela de confirmar. Usado pelo botão "Salvar" na
   *  lista de opções quando o número já foi extraído da fala. */
  async function salvarPorGeocodingResultado(resultado: ResultadoGeocoding, textoOriginal: string) {
    const enderecoCalculado = {
      logradouro: resultado.logradouro || resultado.endereco_normalizado.split(',')[0]?.trim() || '',
      bairro: resultado.bairro ?? '',
      cidade: resultado.cidade ?? '',
      uf: resultado.uf ?? '',
    };
    const numeroCalculado = resultado.numero || extrairNumeroDeTranscricao(textoOriginal) || '';
    const cepCalculado = (resultado.cep && /^\d{8}$/.test(resultado.cep)) ? resultado.cep : cep;
    if (!enderecoCalculado.logradouro || !numeroCalculado.trim()) {
      preencherPorGeocodingResultado(resultado, textoOriginal);
      return;
    }
    vibrar(50);
    await onConfirmar({ cep: cepCalculado, numero: numeroCalculado, endereco: enderecoCalculado });
    setCep(''); setNumero(''); setEndereco(null); setEtapa('cep'); setErro(null); resetarOcr();
  }

  const handleCepChange = useCallback((valor: string) => {
    setCep(normalizarCEP(valor));
    setErro(null);
    setOcrDica(null);
    resetarOcr();
  }, [resetarOcr, setOcrDica]);

  const handleConfirmar = useCallback(async () => {
    if (!endereco || !numero.trim()) return;
    vibrar(50);
    await onConfirmar({ cep, numero, endereco });
    setCep(''); setNumero(''); setEndereco(null); setEtapa('cep'); setErro(null); resetarOcr();
  }, [cep, numero, endereco, onConfirmar, resetarOcr]);

  const handleVoltarParaCep = useCallback(() => {
    setCep(''); setNumero(''); setEndereco(null); setValidacao(null); setErro(null); setEtapa('cep'); resetarOcr();
  }, [resetarOcr]);

  const handleCancelarNota = useCallback(() => {
    setCep(''); setNumero(''); setEndereco(null); setEtapa('cep'); setErro(null); resetarOcr(); onCancelar?.();
  }, [onCancelar, resetarOcr]);

  // ─── RENDER ────────────────────────────────────────────────────────

  const cabecalhoComun = (
    <CabecalhoNF numeroNF={numeroNF} totalNFs={totalNFs} onDesfazerUltima={onDesfazerUltima} />
  );

  if (etapa === 'cep') {
    return (
      <TelaCEP
        cep={cep}
        loading={loading}
        erro={erro}
        buscandoEndereco={buscandoEndereco}
        ocrLendo={ocrLendo}
        ocrParcial={ocrParcial}
        ocrDica={ocrDica}
        ocrFotos={ocrFotos}
        onCepChange={handleCepChange}
        onTranscricao={handleTranscricao}
        onOcrTexto={handleOcrTexto}
        onOcrLendoChange={setOcrLendo}
        onOcrErro={setOcrDica}
        onContinuarComOcr={handleContinuarComOcr}
        onCancelar={onCancelar}
      />
    );
  }

  if (etapa === 'escolha_endereco') {
    return (
      <div style={containerStyle}>
        {cabecalhoComun}
        <ListaOpcoesEndereco
          opcoes={opcoesFala}
          numeroFala={extrairNumeroDeTranscricao(textoFala) ?? undefined}
          onSalvar={async (opcao) => {
            await salvarPorGeocodingResultado(opcao, textoFala);
            setOpcoesFala([]); setTextoFala('');
          }}
          onSelecionar={(opcao) => {
            preencherPorGeocodingResultado(opcao, textoFala);
            setOpcoesFala([]); setTextoFala('');
          }}
          onNenhumDesses={() => {
            setOpcoesFala([]); setCep(''); setEndereco(null); setErro(null); setEtapa('cep');
          }}
        />
      </div>
    );
  }

  if (etapa === 'confirmar' && endereco) {
    return (
      <TelaConfirmar
        numeroNF={numeroNF}
        totalNFs={totalNFs}
        onDesfazerUltima={onDesfazerUltima}
        cep={cep}
        endereco={endereco}
        numero={numero}
        validacao={validacao}
        inputRef={numeroRef}
        onNumeroChange={setNumero}
        onConfirmar={handleConfirmar}
        onVoltar={handleVoltarParaCep}
        onCancelar={handleCancelarNota}
      />
    );
  }

  // Fallback: CEP nao encontrado → form manual
  if (etapa === 'endereco_manual') {
    return (
      <div style={containerStyle}>
        {cabecalhoComun}
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
            setCep(''); setEndereco(null); setErro(null); setEtapa('cep');
          }}
        />
      </div>
    );
  }

  return <div style={containerStyle}>{cabecalhoComun}<div>Carregando…</div></div>;
}

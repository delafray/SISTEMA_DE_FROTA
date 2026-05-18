export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abastecimentos: {
        Row: {
          confirmado: boolean | null
          created_at: string | null
          empresa_id: string
          foto_cupom_urls: string[] | null
          frete_id: string | null
          ia_confianca: number | null
          ia_raw_response: Json | null
          id: string
          km_no_abast: number | null
          litros: number
          motorista_id: string
          posto: string | null
          valor_litro: number | null
          valor_total: number
          veiculo_id: string
        }
        Insert: {
          confirmado?: boolean | null
          created_at?: string | null
          empresa_id: string
          foto_cupom_urls?: string[] | null
          frete_id?: string | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_no_abast?: number | null
          litros: number
          motorista_id: string
          posto?: string | null
          valor_litro?: number | null
          valor_total: number
          veiculo_id: string
        }
        Update: {
          confirmado?: boolean | null
          created_at?: string | null
          empresa_id?: string
          foto_cupom_urls?: string[] | null
          frete_id?: string | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_no_abast?: number | null
          litros?: number
          motorista_id?: string
          posto?: string | null
          valor_litro?: number | null
          valor_total?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abastecimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      adiantamentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string | null
          data_pagamento: string | null
          empresa_id: string
          frete_id: string | null
          id: string
          justificativa: string | null
          motorista_id: string
          recusa_motivo: string | null
          status: string
          tipo: string
          updated_at: string | null
          valor: number
          valor_prestado_contas: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          empresa_id: string
          frete_id?: string | null
          id?: string
          justificativa?: string | null
          motorista_id: string
          recusa_motivo?: string | null
          status?: string
          tipo: string
          updated_at?: string | null
          valor: number
          valor_prestado_contas?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          empresa_id?: string
          frete_id?: string | null
          id?: string
          justificativa?: string | null
          motorista_id?: string
          recusa_motivo?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          valor?: number
          valor_prestado_contas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "adiantamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adiantamentos_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adiantamentos_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adiantamentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          created_at: string | null
          destinatario: string | null
          empresa_id: string
          enviado_em: string | null
          enviado_whatsapp: boolean | null
          id: string
          lido: boolean | null
          lido_em: string | null
          mensagem: string
          motorista_id: string | null
          referencia_id: string | null
          severidade: string
          tipo: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string | null
          destinatario?: string | null
          empresa_id: string
          enviado_em?: string | null
          enviado_whatsapp?: boolean | null
          id?: string
          lido?: boolean | null
          lido_em?: string | null
          mensagem: string
          motorista_id?: string | null
          referencia_id?: string | null
          severidade?: string
          tipo: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string | null
          destinatario?: string | null
          empresa_id?: string
          enviado_em?: string | null
          enviado_whatsapp?: boolean | null
          id?: string
          lido?: boolean | null
          lido_em?: string | null
          mensagem?: string
          motorista_id?: string | null
          referencia_id?: string | null
          severidade?: string
          tipo?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string | null
          dados_antes: Json | null
          dados_depois: Json | null
          descricao: string | null
          empresa_id: string | null
          entidade: string
          entidade_id: string | null
          id: string
          ip: unknown
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          empresa_id?: string | null
          entidade: string
          entidade_id?: string | null
          id?: string
          ip?: unknown
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          empresa_id?: string | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          ip?: unknown
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      avarias: {
        Row: {
          audio_url: string | null
          created_at: string | null
          descricao_ia: string | null
          descricao_motorista: string | null
          empresa_id: string
          foto_urls: string[] | null
          frete_id: string | null
          ia_raw_response: Json | null
          id: string
          manutencao_id: string | null
          motorista_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          updated_at: string | null
          urgencia: string
          veiculo_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string | null
          descricao_ia?: string | null
          descricao_motorista?: string | null
          empresa_id: string
          foto_urls?: string[] | null
          frete_id?: string | null
          ia_raw_response?: Json | null
          id?: string
          manutencao_id?: string | null
          motorista_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          updated_at?: string | null
          urgencia: string
          veiculo_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string | null
          descricao_ia?: string | null
          descricao_motorista?: string | null
          empresa_id?: string
          foto_urls?: string[] | null
          frete_id?: string | null
          ia_raw_response?: Json | null
          id?: string
          manutencao_id?: string | null
          motorista_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          updated_at?: string | null
          urgencia?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avarias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_manutencao_id_fkey"
            columns: ["manutencao_id"]
            isOneToOne: false
            referencedRelation: "manutencoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists_diarios: {
        Row: {
          created_at: string | null
          data: string
          empresa_id: string
          frete_id: string | null
          id: string
          motorista_id: string
          observacoes: string | null
          problemas: string[] | null
          respostas: Json
          status: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string | null
          data?: string
          empresa_id: string
          frete_id?: string | null
          id?: string
          motorista_id: string
          observacoes?: string | null
          problemas?: string[] | null
          respostas?: Json
          status?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string | null
          data?: string
          empresa_id?: string
          frete_id?: string | null
          id?: string
          motorista_id?: string
          observacoes?: string | null
          problemas?: string[] | null
          respostas?: Json
          status?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_diarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          contato_nome: string | null
          created_at: string | null
          documento: string
          email: string | null
          empresa_id: string
          forma_pagamento_padrao: string | null
          id: string
          inscricao_estadual: string | null
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          observacoes: string | null
          razao_social: string | null
          telefone: string | null
          tipo_pessoa: string
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          documento: string
          email?: string | null
          empresa_id: string
          forma_pagamento_padrao?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          observacoes?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_pessoa: string
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          documento?: string
          email?: string | null
          empresa_id?: string
          forma_pagamento_padrao?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          observacoes?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_pessoa?: string
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_frete: {
        Row: {
          adiantamento_id: string | null
          confirmado: boolean | null
          created_at: string | null
          data_despesa: string
          empresa_id: string
          foto_cupom_urls: string[] | null
          frete_id: string
          ia_confianca: number | null
          ia_raw_response: Json | null
          id: string
          local: string | null
          motorista_id: string
          tipo: string
          valor: number
        }
        Insert: {
          adiantamento_id?: string | null
          confirmado?: boolean | null
          created_at?: string | null
          data_despesa?: string
          empresa_id: string
          foto_cupom_urls?: string[] | null
          frete_id: string
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          local?: string | null
          motorista_id: string
          tipo: string
          valor: number
        }
        Update: {
          adiantamento_id?: string | null
          confirmado?: boolean | null
          created_at?: string | null
          data_despesa?: string
          empresa_id?: string
          foto_cupom_urls?: string[] | null
          frete_id?: string
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          local?: string | null
          motorista_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_frete_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "adiantamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string
          complemento: string | null
          created_at: string | null
          email: string | null
          id: string
          inscricao_estadual: string | null
          logo_url: string | null
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          razao_social: string | null
          telefone: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          razao_social?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          razao_social?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fretes: {
        Row: {
          aceito_pelo_motorista_em: string | null
          cliente_id: string | null
          comissao_motorista_valor: number | null
          created_at: string | null
          criado_por_usuario_id: string | null
          criado_via: string
          data_coleta_prevista: string | null
          data_entrega_prevista: string | null
          data_fim: string | null
          data_inicio: string | null
          data_pagamento: string | null
          destino: string
          empresa_id: string
          forma_pagamento: string | null
          id: string
          km_final: number | null
          km_inicial: number
          km_total: number | null
          motorista_id: string
          observacoes: string | null
          observacoes_financeiras: string | null
          origem: string
          pago: boolean | null
          peso_carga_kg: number | null
          status: string
          tipo_carga: string | null
          updated_at: string | null
          valor_frete: number | null
          veiculo_id: string
        }
        Insert: {
          aceito_pelo_motorista_em?: string | null
          cliente_id?: string | null
          comissao_motorista_valor?: number | null
          created_at?: string | null
          criado_por_usuario_id?: string | null
          criado_via?: string
          data_coleta_prevista?: string | null
          data_entrega_prevista?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_pagamento?: string | null
          destino: string
          empresa_id: string
          forma_pagamento?: string | null
          id?: string
          km_final?: number | null
          km_inicial: number
          km_total?: number | null
          motorista_id: string
          observacoes?: string | null
          observacoes_financeiras?: string | null
          origem: string
          pago?: boolean | null
          peso_carga_kg?: number | null
          status?: string
          tipo_carga?: string | null
          updated_at?: string | null
          valor_frete?: number | null
          veiculo_id: string
        }
        Update: {
          aceito_pelo_motorista_em?: string | null
          cliente_id?: string | null
          comissao_motorista_valor?: number | null
          created_at?: string | null
          criado_por_usuario_id?: string | null
          criado_via?: string
          data_coleta_prevista?: string | null
          data_entrega_prevista?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_pagamento?: string | null
          destino?: string
          empresa_id?: string
          forma_pagamento?: string | null
          id?: string
          km_final?: number | null
          km_inicial?: number
          km_total?: number | null
          motorista_id?: string
          observacoes?: string | null
          observacoes_financeiras?: string | null
          origem?: string
          pago?: boolean | null
          peso_carga_kg?: number | null
          status?: string
          tipo_carga?: string | null
          updated_at?: string | null
          valor_frete?: number | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fretes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "fretes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      imprevistos: {
        Row: {
          created_at: string | null
          descricao: string | null
          duracao_estimada_min: number | null
          empresa_id: string
          frete_id: string | null
          id: string
          motorista_id: string
          notificado_gestor: boolean | null
          resolvido: boolean | null
          resolvido_em: string | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          duracao_estimada_min?: number | null
          empresa_id: string
          frete_id?: string | null
          id?: string
          motorista_id: string
          notificado_gestor?: boolean | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          duracao_estimada_min?: number | null
          empresa_id?: string
          frete_id?: string | null
          id?: string
          motorista_id?: string
          notificado_gestor?: boolean | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "imprevistos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imprevistos_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imprevistos_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imprevistos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      km_logs: {
        Row: {
          confirmado: boolean | null
          correcao: boolean | null
          correcao_motivo: string | null
          created_at: string | null
          empresa_id: string
          foto_urls: string[] | null
          frete_id: string | null
          ia_confianca: number | null
          ia_raw_response: Json | null
          id: string
          km_lido: number
          motorista_id: string
          tipo: string
          veiculo_id: string
        }
        Insert: {
          confirmado?: boolean | null
          correcao?: boolean | null
          correcao_motivo?: string | null
          created_at?: string | null
          empresa_id: string
          foto_urls?: string[] | null
          frete_id?: string | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_lido: number
          motorista_id: string
          tipo: string
          veiculo_id: string
        }
        Update: {
          confirmado?: boolean | null
          correcao?: boolean | null
          correcao_motivo?: string | null
          created_at?: string | null
          empresa_id?: string
          foto_urls?: string[] | null
          frete_id?: string | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_lido?: number
          motorista_id?: string
          tipo?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "km_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_frete_id_fkey"
            columns: ["frete_id"]
            isOneToOne: false
            referencedRelation: "fretes_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      manutencoes: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string | null
          custo_mao_obra: number | null
          custo_pecas: number | null
          custo_total: number | null
          data_proxima: string | null
          data_realizada: string | null
          descricao: string | null
          empresa_id: string
          fornecedor: string | null
          fornecedor_cnpj: string | null
          id: string
          km_proxima: number | null
          km_realizada: number | null
          nota_fiscal_numero: string | null
          nota_fiscal_urls: string[] | null
          observacoes: string | null
          status: string
          tipo_id: string
          updated_at: string | null
          veiculo_id: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          custo_mao_obra?: number | null
          custo_pecas?: number | null
          custo_total?: number | null
          data_proxima?: string | null
          data_realizada?: string | null
          descricao?: string | null
          empresa_id: string
          fornecedor?: string | null
          fornecedor_cnpj?: string | null
          id?: string
          km_proxima?: number | null
          km_realizada?: number | null
          nota_fiscal_numero?: string | null
          nota_fiscal_urls?: string[] | null
          observacoes?: string | null
          status?: string
          tipo_id: string
          updated_at?: string | null
          veiculo_id: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          custo_mao_obra?: number | null
          custo_pecas?: number | null
          custo_total?: number | null
          data_proxima?: string | null
          data_realizada?: string | null
          descricao?: string | null
          empresa_id?: string
          fornecedor?: string | null
          fornecedor_cnpj?: string | null
          id?: string
          km_proxima?: number | null
          km_realizada?: number | null
          nota_fiscal_numero?: string | null
          nota_fiscal_urls?: string[] | null
          observacoes?: string | null
          status?: string
          tipo_id?: string
          updated_at?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["tipo_id"]
          },
          {
            foreignKeyName: "manutencoes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      motoristas: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cargo: string | null
          cep: string | null
          cidade: string | null
          cnh_categoria: string
          cnh_ear: boolean | null
          cnh_foto_url: string | null
          cnh_numero: string
          cnh_primeira_habilitacao: string | null
          cnh_validade: string
          complemento: string | null
          cpf: string
          created_at: string | null
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          email: string | null
          empresa_id: string
          foto_url: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          percentual_frete: number | null
          rg: string | null
          salario_fixo: number | null
          tipo_comissao: string
          uf: string | null
          updated_at: string | null
          valor_fixo_por_viagem: number | null
          valor_por_km: number | null
          whatsapp: string
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          cnh_categoria: string
          cnh_ear?: boolean | null
          cnh_foto_url?: string | null
          cnh_numero: string
          cnh_primeira_habilitacao?: string | null
          cnh_validade: string
          complemento?: string | null
          cpf: string
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id: string
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          percentual_frete?: number | null
          rg?: string | null
          salario_fixo?: number | null
          tipo_comissao?: string
          uf?: string | null
          updated_at?: string | null
          valor_fixo_por_viagem?: number | null
          valor_por_km?: number | null
          whatsapp: string
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          cidade?: string | null
          cnh_categoria?: string
          cnh_ear?: boolean | null
          cnh_foto_url?: string | null
          cnh_numero?: string
          cnh_primeira_habilitacao?: string | null
          cnh_validade?: string
          complemento?: string | null
          cpf?: string
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id?: string
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          percentual_frete?: number | null
          rg?: string | null
          salario_fixo?: number | null
          tipo_comissao?: string
          uf?: string | null
          updated_at?: string | null
          valor_fixo_por_viagem?: number | null
          valor_por_km?: number | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "motoristas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean | null
          cpf: string | null
          created_at: string | null
          foto_url: string | null
          id: string
          motorista_id: string | null
          nome: string
          telefone: string | null
          updated_at: string | null
          whatsapp_bot: string | null
        }
        Insert: {
          ativo?: boolean | null
          cpf?: string | null
          created_at?: string | null
          foto_url?: string | null
          id: string
          motorista_id?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string | null
          whatsapp_bot?: string | null
        }
        Update: {
          ativo?: boolean | null
          cpf?: string | null
          created_at?: string | null
          foto_url?: string | null
          id?: string
          motorista_id?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string | null
          whatsapp_bot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: true
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_manutencao_veiculo: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          empresa_id: string
          id: string
          intervalo_km: number | null
          intervalo_meses: number | null
          observacoes: string | null
          tipo_id: string
          updated_at: string | null
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id: string
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          observacoes?: string | null
          tipo_id: string
          updated_at?: string | null
          veiculo_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: string
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          observacoes?: string | null
          tipo_id?: string
          updated_at?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_manutencao_veiculo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["tipo_id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      sessoes_whatsapp: {
        Row: {
          contexto: Json | null
          empresa_id: string | null
          estado: string
          id: string
          motorista_id: string | null
          ultimo_contato: string
          whatsapp: string
        }
        Insert: {
          contexto?: Json | null
          empresa_id?: string | null
          estado?: string
          id?: string
          motorista_id?: string | null
          ultimo_contato?: string
          whatsapp: string
        }
        Update: {
          contexto?: Json | null
          empresa_id?: string | null
          estado?: string
          id?: string
          motorista_id?: string | null
          ultimo_contato?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_whatsapp_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_whatsapp_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_manutencao: {
        Row: {
          ativo: boolean | null
          categoria: string
          codigo: string
          created_at: string | null
          criticidade: string
          custo_estimado_max: number | null
          custo_estimado_min: number | null
          descricao: string | null
          empresa_id: string | null
          id: string
          intervalo_km: number | null
          intervalo_meses: number | null
          nome: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria: string
          codigo: string
          created_at?: string | null
          criticidade?: string
          custo_estimado_max?: number | null
          custo_estimado_min?: number | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          nome: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string
          codigo?: string
          created_at?: string | null
          criticidade?: string
          custo_estimado_max?: number | null
          custo_estimado_min?: number | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          nome?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_manutencao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_empresas: {
        Row: {
          created_at: string | null
          empresa_id: string
          id: string
          is_padrao: boolean | null
          role: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          id?: string
          is_padrao?: boolean | null
          role?: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          id?: string
          is_padrao?: boolean | null
          role?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_empresas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          ano: number
          apelido: string | null
          apolice_numero: string | null
          ativo: boolean | null
          capacidade_carga_kg: number | null
          capacidade_tanque: number | null
          categoria: string | null
          chassi: string
          combustivel: string
          cor: string | null
          created_at: string | null
          data_aquisicao: string | null
          data_proxima_revisao: string | null
          eixos: number | null
          empresa_id: string
          foto_url: string | null
          id: string
          ipva_vencimento: string | null
          km_atual: number | null
          km_proxima_revisao: number | null
          km_proxima_troca_oleo: number | null
          licenciamento_vencimento: string | null
          marca: string
          modelo: string
          pbt_kg: number | null
          placa: string
          renavam: string
          seguradora: string | null
          seguro_vencimento: string | null
          tipo: string
          updated_at: string | null
          valor_aquisicao: number | null
        }
        Insert: {
          ano: number
          apelido?: string | null
          apolice_numero?: string | null
          ativo?: boolean | null
          capacidade_carga_kg?: number | null
          capacidade_tanque?: number | null
          categoria?: string | null
          chassi: string
          combustivel: string
          cor?: string | null
          created_at?: string | null
          data_aquisicao?: string | null
          data_proxima_revisao?: string | null
          eixos?: number | null
          empresa_id: string
          foto_url?: string | null
          id?: string
          ipva_vencimento?: string | null
          km_atual?: number | null
          km_proxima_revisao?: number | null
          km_proxima_troca_oleo?: number | null
          licenciamento_vencimento?: string | null
          marca: string
          modelo: string
          pbt_kg?: number | null
          placa: string
          renavam: string
          seguradora?: string | null
          seguro_vencimento?: string | null
          tipo: string
          updated_at?: string | null
          valor_aquisicao?: number | null
        }
        Update: {
          ano?: number
          apelido?: string | null
          apolice_numero?: string | null
          ativo?: boolean | null
          capacidade_carga_kg?: number | null
          capacidade_tanque?: number | null
          categoria?: string | null
          chassi?: string
          combustivel?: string
          cor?: string | null
          created_at?: string | null
          data_aquisicao?: string | null
          data_proxima_revisao?: string | null
          eixos?: number | null
          empresa_id?: string
          foto_url?: string | null
          id?: string
          ipva_vencimento?: string | null
          km_atual?: number | null
          km_proxima_revisao?: number | null
          km_proxima_troca_oleo?: number | null
          licenciamento_vencimento?: string | null
          marca?: string
          modelo?: string
          pbt_kg?: number | null
          placa?: string
          renavam?: string
          seguradora?: string | null
          seguro_vencimento?: string | null
          tipo?: string
          updated_at?: string | null
          valor_aquisicao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      fretes_com_resultado: {
        Row: {
          cliente_id: string | null
          criado_via: string | null
          custo_combustivel: number | null
          custo_comissao: number | null
          custo_despesas: number | null
          custo_total: number | null
          data_fim: string | null
          data_inicio: string | null
          destino: string | null
          empresa_id: string | null
          id: string | null
          km_total: number | null
          lucro_bruto: number | null
          margem_pct: number | null
          motorista_id: string | null
          origem: string | null
          receita: number | null
          status: string | null
          veiculo_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          criado_via?: string | null
          custo_combustivel?: never
          custo_comissao?: never
          custo_despesas?: never
          custo_total?: never
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string | null
          empresa_id?: string | null
          id?: string | null
          km_total?: number | null
          lucro_bruto?: never
          margem_pct?: never
          motorista_id?: string | null
          origem?: string | null
          receita?: never
          status?: string | null
          veiculo_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          criado_via?: string | null
          custo_combustivel?: never
          custo_comissao?: never
          custo_despesas?: never
          custo_total?: never
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string | null
          empresa_id?: string | null
          id?: string | null
          km_total?: number | null
          lucro_bruto?: never
          margem_pct?: never
          motorista_id?: string | null
          origem?: string | null
          receita?: never
          status?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fretes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "fretes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mensal_empresa: {
        Row: {
          custo_por_km: number | null
          custo_total: number | null
          empresa_id: string | null
          km_total: number | null
          lucro_bruto: number | null
          margem_pct: number | null
          mes: string | null
          qtd_fretes: number | null
          receita_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fretes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mensal_motorista: {
        Row: {
          custo_total: number | null
          empresa_id: string | null
          km_total: number | null
          lucro_bruto: number | null
          mes: string | null
          motorista_id: string | null
          qtd_fretes: number | null
          receita_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fretes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mensal_veiculo: {
        Row: {
          custo_total: number | null
          empresa_id: string | null
          km_total: number | null
          lucro_bruto: number | null
          mes: string | null
          qtd_fretes: number | null
          receita_total: number | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fretes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fretes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "fretes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      proxima_manutencao_veiculo: {
        Row: {
          categoria: string | null
          criticidade: string | null
          data_proxima: string | null
          data_ultima: string | null
          empresa_id: string | null
          intervalo_km: number | null
          intervalo_meses: number | null
          km_atual: number | null
          km_faltando: number | null
          km_proxima: number | null
          km_ultima: number | null
          placa: string | null
          status: string | null
          tipo_id: string | null
          tipo_nome: string | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calcular_comissao: {
        Args: {
          p_km_total: number
          p_motorista_id: string
          p_valor_frete: number
        }
        Returns: number
      }
      get_user_empresas: { Args: never; Returns: string[] }
      get_user_motorista_id: { Args: never; Returns: string }
      get_user_role: { Args: { p_empresa_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

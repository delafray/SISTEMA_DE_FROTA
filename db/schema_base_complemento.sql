-- COMPLEMENTO DO SCHEMA BASE — funções, triggers e GRANTs (gerado da produção em 2026-06-11)
-- Rodar DEPOIS de db/schema_base_completo.sql.
-- =============================================================================
-- Contagem: 22 funções · 27 triggers · 53× DISABLE RLS · 7× GRANTs
-- Fix aplicado: bloquear_inativacao_* corrigidos (fretes→pedidos);
--               calcular_comissao_snapshot removido (comissão saiu do modelo).
-- =============================================================================

-- =============================================================================
-- SEÇÃO 1 — FUNÇÕES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO perfis (id, nome)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email, 'Usuário')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.propagar_km_para_veiculo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.confirmado = true AND NEW.correcao = false THEN
    UPDATE veiculos
       SET km_atual = NEW.km_lido,
           updated_at = now()
     WHERE id = NEW.veiculo_id
       AND km_atual < NEW.km_lido;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.manutencao_calcula_proxima()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_intervalo_km    int;
  v_intervalo_meses int;
BEGIN
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    SELECT COALESCE(pmv.intervalo_km, t.intervalo_km),
           COALESCE(pmv.intervalo_meses, t.intervalo_meses)
      INTO v_intervalo_km, v_intervalo_meses
      FROM tipos_manutencao t
      LEFT JOIN plano_manutencao_veiculo pmv
             ON pmv.veiculo_id = NEW.veiculo_id AND pmv.tipo_id = t.id
     WHERE t.id = NEW.tipo_id;

    IF v_intervalo_km IS NOT NULL AND NEW.km_realizada IS NOT NULL THEN
      NEW.km_proxima := NEW.km_realizada + v_intervalo_km;
    END IF;
    IF v_intervalo_meses IS NOT NULL AND NEW.data_realizada IS NOT NULL THEN
      NEW.data_proxima := NEW.data_realizada + (v_intervalo_meses || ' months')::interval;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.criar_alerta_avaria_critica()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.urgencia IN ('alta', 'critica') THEN
    INSERT INTO alertas (empresa_id, veiculo_id, motorista_id, tipo, referencia_id, mensagem, severidade)
    VALUES (
      NEW.empresa_id,
      NEW.veiculo_id,
      NEW.motorista_id,
      'avaria_critica',
      NEW.id,
      'Avaria ' || UPPER(NEW.urgencia) || ' registrada no veículo. Verificar imediatamente.',
      CASE WHEN NEW.urgencia = 'critica' THEN 'critico' ELSE 'urgente' END
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_correcao_km()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.correcao = true THEN
    INSERT INTO audit_logs (empresa_id, acao, entidade, entidade_id, descricao, dados_depois)
    VALUES (
      NEW.empresa_id,
      'correcao_km',
      'km_logs',
      NEW.id,
      'Correção retroativa de KM. Motivo: ' || COALESCE(NEW.correcao_motivo, 'não informado'),
      row_to_json(NEW)::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.checklist_cria_avaria()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'com_problemas' AND array_length(NEW.problemas, 1) > 0 THEN
    INSERT INTO avarias (
      empresa_id, veiculo_id, motorista_id, frete_id,
      descricao_motorista, urgencia, status
    ) VALUES (
      NEW.empresa_id,
      NEW.veiculo_id,
      NEW.motorista_id,
      NEW.frete_id,
      'Detectado no checklist diário: ' || array_to_string(NEW.problemas, ', '),
      'media',
      'aberta'
    );
    -- Alerta ao gestor
    INSERT INTO alertas (empresa_id, veiculo_id, motorista_id, tipo, mensagem, severidade)
    VALUES (
      NEW.empresa_id,
      NEW.veiculo_id,
      NEW.motorista_id,
      'checklist_com_problemas',
      'Checklist do dia ' || NEW.data || ' com problemas: ' || array_to_string(NEW.problemas, ', '),
      'aviso'
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.alerta_adiantamento_pendente()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'pendente' THEN
    INSERT INTO alertas (empresa_id, motorista_id, tipo, referencia_id, mensagem, severidade)
    VALUES (
      NEW.empresa_id,
      NEW.motorista_id,
      'adiantamento_solicitado',
      NEW.id,
      'Adiantamento solicitado: R$ ' || NEW.valor || ' (' || NEW.tipo || ')',
      'aviso'
    );
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.alerta_imprevisto_viagem()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO alertas (empresa_id, motorista_id, tipo, referencia_id, mensagem, severidade)
  VALUES (
    NEW.empresa_id,
    NEW.motorista_id,
    'imprevisto_viagem',
    NEW.id,
    'Imprevisto: ' || NEW.tipo || COALESCE(' — ' || NEW.descricao, '') ||
      COALESCE(' (~' || NEW.duracao_estimada_min || ' min)', ''),
    'aviso'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_empresas()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    ARRAY(SELECT empresa_id FROM usuario_empresas WHERE usuario_id = auth.uid()),
    '{}'::uuid[]
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(p_empresa_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM usuario_empresas
   WHERE usuario_id = auth.uid()
     AND empresa_id = p_empresa_id
   LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_motorista_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT motorista_id FROM perfis WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_empresa_cross_fretes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_empresa_veiculo  uuid;
  v_empresa_motorista uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_veiculo   FROM veiculos   WHERE id = NEW.veiculo_id;
  SELECT empresa_id INTO v_empresa_motorista FROM motoristas  WHERE id = NEW.motorista_id;

  IF v_empresa_veiculo <> NEW.empresa_id THEN
    RAISE EXCEPTION 'Veículo não pertence à empresa do frete (empresa_id: % vs %).',
      v_empresa_veiculo, NEW.empresa_id;
  END IF;
  IF v_empresa_motorista <> NEW.empresa_id THEN
    RAISE EXCEPTION 'Motorista não pertence à empresa do frete (empresa_id: % vs %).',
      v_empresa_motorista, NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.frete_concluido_exige_km_final()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'concluido' AND NEW.km_final IS NULL THEN
    RAISE EXCEPTION 'Não é possível concluir um frete sem km_final.';
  END IF;
  RETURN NEW;
END;
$function$
;

-- CORRIGIDO em 11/06: era FROM fretes (tabela renomeada) → agora FROM pedidos
CREATE OR REPLACE FUNCTION public.bloquear_inativacao_motorista()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ativo = true AND NEW.ativo = false THEN
    IF EXISTS (
      SELECT 1 FROM pedidos
       WHERE motorista_id = NEW.id
         AND status IN ('em_andamento')
    ) THEN
      RAISE EXCEPTION 'Motorista possui pedido em andamento. Conclua ou cancele o pedido antes de inativar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

-- CORRIGIDO em 11/06: era FROM fretes (tabela renomeada) → agora FROM pedidos
CREATE OR REPLACE FUNCTION public.bloquear_inativacao_veiculo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ativo = true AND NEW.ativo = false THEN
    IF EXISTS (
      SELECT 1 FROM pedidos
       WHERE veiculo_id = NEW.id
         AND status IN ('em_andamento')
    ) THEN
      RAISE EXCEPTION 'Veículo possui pedido em andamento. Conclua ou cancele o pedido antes de inativar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_master_of_empresa(emp_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuario_empresas
    WHERE usuario_id = auth.uid()
      AND empresa_id = emp_id
      AND role = 'master'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.validar_veiculo_sem_manutencao_ativa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.veiculo_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.manutencoes
    WHERE veiculo_id = NEW.veiculo_id
      AND status IN ('planejada', 'pendente', 'aprovada', 'em_execucao')
      AND data_realizada IS NULL
  ) THEN
    RAISE EXCEPTION 'VEICULO_EM_MANUTENCAO: O veículo selecionado possui manutenção ativa. Conclua ou cancele a manutenção antes de criar esta viagem.';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_session_atomic(p_session_id uuid, p_estado text, p_contexto_patch jsonb)
 RETURNS sessoes_whatsapp
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row sessoes_whatsapp;
BEGIN
  -- Pega lock exclusivo na linha. Outras chamadas concorrentes pra
  -- mesma sessao bloqueiam aqui ate este transaction commitar.
  SELECT * INTO v_row
    FROM sessoes_whatsapp
    WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Sessao foi removida (timeout, cleanup, etc) entre o turno anterior
    -- e este. Devolve NULL pra o caller sinalizar 'sessao_perdida'.
    RETURN NULL;
  END IF;

  UPDATE sessoes_whatsapp
    SET estado = COALESCE(p_estado, v_row.estado),
        contexto = COALESCE(v_row.contexto, '{}'::jsonb) || COALESCE(p_contexto_patch, '{}'::jsonb),
        ultimo_contato = now()
    WHERE id = p_session_id
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.consumir_geocode_cota(p_mes text, p_limite integer)
 RETURNS TABLE(permitido boolean, total integer)
 LANGUAGE plpgsql
AS $function$
declare
  v_total integer;
begin
  insert into public.geocode_uso (mes, total) values (p_mes, 0)
    on conflict (mes) do nothing;

  update public.geocode_uso gu
    set total = gu.total + 1, atualizado_em = now()
    where gu.mes = p_mes and gu.total < p_limite
    returning gu.total into v_total;

  if found then
    return query select true, v_total;
  else
    select gu.total into v_total from public.geocode_uso gu where gu.mes = p_mes;
    return query select false, coalesce(v_total, p_limite);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gerar_numero_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ano INTEGER;
  v_seq INTEGER;
BEGIN
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_ano := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::INTEGER;
  INSERT INTO pedido_numeracao (ano, proximo) VALUES (v_ano, 1002)
    ON CONFLICT (ano) DO UPDATE SET proximo = pedido_numeracao.proximo + 1
    RETURNING proximo - 1 INTO v_seq;
  NEW.numero := v_ano || '.' || v_seq;
  RETURN NEW;
END;
$function$
;

-- =============================================================================
-- SEÇÃO 2 — TRIGGERS
-- =============================================================================

CREATE TRIGGER trigger_propagar_km
  AFTER INSERT ON public.km_logs
  FOR EACH ROW EXECUTE FUNCTION propagar_km_para_veiculo();

CREATE TRIGGER trigger_manutencao_calcula_proxima
  BEFORE UPDATE ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION manutencao_calcula_proxima();

CREATE TRIGGER trigger_alerta_avaria_critica
  AFTER INSERT ON public.avarias
  FOR EACH ROW EXECUTE FUNCTION criar_alerta_avaria_critica();

CREATE TRIGGER trigger_log_correcao_km
  AFTER INSERT ON public.km_logs
  FOR EACH ROW EXECUTE FUNCTION log_correcao_km();

CREATE TRIGGER trigger_checklist_cria_avaria
  AFTER INSERT ON public.checklists_diarios
  FOR EACH ROW EXECUTE FUNCTION checklist_cria_avaria();

CREATE TRIGGER trigger_alerta_adiantamento
  AFTER INSERT ON public.adiantamentos
  FOR EACH ROW EXECUTE FUNCTION alerta_adiantamento_pendente();

CREATE TRIGGER trigger_alerta_imprevisto
  AFTER INSERT ON public.imprevistos
  FOR EACH ROW EXECUTE FUNCTION alerta_imprevisto_viagem();

CREATE TRIGGER trg_updated_at_empresas
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_perfis
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_veiculos
  BEFORE UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_motoristas
  BEFORE UPDATE ON public.motoristas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_clientes
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_fretes
  BEFORE UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_manutencoes
  BEFORE UPDATE ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_avarias
  BEFORE UPDATE ON public.avarias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_adiantamentos
  BEFORE UPDATE ON public.adiantamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_tipos_man
  BEFORE UPDATE ON public.tipos_manutencao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_plano_man
  BEFORE UPDATE ON public.plano_manutencao_veiculo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_validar_empresa_frete
  BEFORE INSERT OR UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION validar_empresa_cross_fretes();

CREATE TRIGGER trigger_frete_concluido_km_final
  BEFORE UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION frete_concluido_exige_km_final();

CREATE TRIGGER trigger_bloquear_inativacao_motorista
  BEFORE UPDATE ON public.motoristas
  FOR EACH ROW EXECUTE FUNCTION bloquear_inativacao_motorista();

CREATE TRIGGER trigger_bloquear_inativacao_veiculo
  BEFORE UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION bloquear_inativacao_veiculo();

CREATE TRIGGER trg_updated_at_despesas_avulsas
  BEFORE UPDATE ON public.despesas_avulsas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_recorrencias_financeiras
  BEFORE UPDATE ON public.recorrencias_financeiras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trigger_validar_veiculo_manutencao
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION validar_veiculo_sem_manutencao_ativa();

CREATE TRIGGER trg_veiculos_updated_at
  BEFORE UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pedidos_numero
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION gerar_numero_pedido();

-- =============================================================================
-- SEÇÃO 3 — RLS DESABILITADO (estado de produção — multi-tenant é fase futura)
-- =============================================================================

ALTER TABLE public.abastecimentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.acerto_ajustes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.acertos_motorista DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.adiantamentos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alocacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.avarias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_contexto_conversa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_estado_pendente DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_metricas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_msgs_processadas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cep_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists_diarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contatos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_preferencias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contexto_ia DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordenadas_aprendidas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas_avulsas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas_veiculo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.endereco_validacao_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocode_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocode_uso DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprevistos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.km_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lembretes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.locais_carregamento DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.motorista_veiculo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.motoristas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_capturadas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.paradas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_motoristas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_numeracao DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_parcelas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_manutencao_veiculo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pod DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prints_zap DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recorrencias_financeiras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.regras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotas_otimizadas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_whatsapp DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.telefones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_manutencao DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_empresas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.veiculos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_historico DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SEÇÃO 4 — GRANTs
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

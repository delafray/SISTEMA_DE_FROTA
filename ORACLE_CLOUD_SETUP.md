# Oracle Cloud — VM OSRM/VROOM (Roteirização)

> Documentação completa da configuração da VM Oracle Cloud para o serviço de roteirização (OSRM + VROOM).

---

## 1. Dados da Conta

| Campo | Valor |
|---|---|
| **Email** | ronaldo@ronaldoborba.com.br |
| **Tenancy** | ronaldo42 |
| **Região** | US East (Ashburn) / `us-ashburn-1` |
| **User OCID** | `ocid1.user.oc1..aaaaaaaaj4i3y57tjijyoix3rx77ztngqbudapczh4ebtydswackohh2boeq` |
| **Tenancy OCID** | `ocid1.tenancy.oc1..aaaaaaaadwdnn4smeqo6vfoibpiuhduxehorismowmvfdcxgmfyjmvpk6isa` |
| **Console** | https://cloud.oracle.com |

---

## 2. Especificações da VM

| Campo | Valor |
|---|---|
| **Nome** | `osrm-routing` |
| **Shape** | VM.Standard.A1.Flex (ARM/Ampere) |
| **OCPUs** | 4 |
| **Memória** | 24 GB |
| **Disco** | 46.6 GB (boot volume padrão) |
| **OS** | Canonical Ubuntu 22.04 |
| **Custo** | Always Free (gratuito permanente) |
| **IP Público** | *(preenchido após criação — salvo em `C:\Users\ronal\vm_ip.txt`)* |

---

## 3. Arquivos Importantes no Computador Local

### Chaves e Configuração OCI CLI

| Arquivo | Caminho | Função |
|---|---|---|
| Config OCI CLI | `C:\Users\ronal\.oci\config` | Configuração de autenticação da API Oracle |
| Chave privada API | `C:\Users\ronal\.oci\oci_api_key.pem` | Autenticação com a Oracle Cloud API |
| Chave pública API | `C:\Users\ronal\.oci\oci_api_key_public.pem` | Registrada no console Oracle (API Keys) |
| Fingerprint | `58:d6:4f:a2:dd:94:72:ab:ea:d8:73:79:c7:f3:4e:32` | Identificador da chave API |

### Chaves SSH (Acesso à VM)

| Arquivo | Caminho | Função |
|---|---|---|
| Chave privada SSH | `C:\Users\ronal\.ssh\osrm-key.pem` | Para conectar na VM via SSH |
| Chave pública SSH | `C:\Users\ronal\.ssh\osrm-key.pub` | Instalada na VM durante criação |

### OCI CLI

| Item | Caminho |
|---|---|
| Executável | `C:\Users\ronal\bin\oci.exe` |
| Instalação | `C:\Users\ronal\lib\oracle-cli\` |
| Python do OCI | `C:\Users\ronal\lib\oracle-cli\Scripts\python.exe` |

### Scripts

| Arquivo | Caminho | Função |
|---|---|---|
| Script criação VM | `C:\Users\ronal\criar_vm_osrm.ps1` | Tenta criar a VM automaticamente |
| Resultado da VM | `C:\Users\ronal\vm_osrm_criada.json` | Detalhes da VM após criação |
| IP da VM | `C:\Users\ronal\vm_ip.txt` | IP público salvo automaticamente |

---

## 4. IDs de Recursos Oracle (para referência)

```
Subnet:  ocid1.subnet.oc1.iad.aaaaaaaampkhknaa2rgs4rocxk7kmi3qfaigvkp44wmczuwaym5d5sbpr5jq
Imagem:  ocid1.image.oc1.iad.aaaaaaaas3q57pjdbmj46ykc5djtazakxanfvvadw43iuyguiue6ruvjd6yq

Availability Domains:
  - vqJu:US-ASHBURN-AD-1
  - vqJu:US-ASHBURN-AD-2
  - vqJu:US-ASHBURN-AD-3
```

---

## 5. Como Usar

### 5.1 Rodar o Script de Criação da VM

Abrir **PowerShell como Administrador** e executar:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; & "C:\Users\ronal\criar_vm_osrm.ps1"
```

O script tenta criar a VM nos 3 Availability Domains a cada 60 segundos.
Quando conseguir, mostra mensagem verde com o IP e salva em `C:\Users\ronal\vm_ip.txt`.

> **IMPORTANTE:** Não fechar o PowerShell enquanto o script estiver rodando!

### 5.2 Conectar na VM via SSH (após criação)

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@<IP_DA_VM>
```

### 5.3 Comandos Úteis do OCI CLI

```powershell
# Listar instâncias
& "C:\Users\ronal\bin\oci.exe" compute instance list --compartment-id ocid1.tenancy.oc1..aaaaaaaadwdnn4smeqo6vfoibpiuhduxehorismowmvfdcxgmfyjmvpk6isa

# Ver status de uma instância
& "C:\Users\ronal\bin\oci.exe" compute instance get --instance-id <INSTANCE_OCID>

# Parar instância
& "C:\Users\ronal\bin\oci.exe" compute instance action --action STOP --instance-id <INSTANCE_OCID>

# Iniciar instância
& "C:\Users\ronal\bin\oci.exe" compute instance action --action START --instance-id <INSTANCE_OCID>

# Listar regras de firewall (security list)
& "C:\Users\ronal\bin\oci.exe" network security-list list --compartment-id ocid1.tenancy.oc1..aaaaaaaadwdnn4smeqo6vfoibpiuhduxehorismowmvfdcxgmfyjmvpk6isa
```

---

## 6. Próximos Passos (Após VM Criada)

1. **Anotar o IP público** da VM
2. **Abrir portas no firewall Oracle** (portas 5000 para OSRM, 3000 para VROOM)
3. **Conectar via SSH** e instalar:
   - Docker
   - OSRM Backend (com mapa `brazil-latest.osm.pbf`)
   - VROOM (otimizador de rotas)
4. **Integrar no sistema** (atualizar variáveis de ambiente com URLs dos serviços)

### Portas Necessárias

| Porta | Serviço | Protocolo |
|---|---|---|
| 22 | SSH | TCP |
| 5000 | OSRM Backend | TCP |
| 3000 | VROOM | TCP |

---

## 7. Script Completo de Criação Automática

```powershell
# =============================================================
# SCRIPT AUTOMATICO - Cria VM OSRM na Oracle Cloud
# Fica tentando ate conseguir (pode demorar horas!)
# Para parar: feche a janela ou Ctrl+C
# =============================================================

$OCI = "C:\Users\ronal\bin\oci.exe"
$COMPARTMENT_ID = "ocid1.tenancy.oc1..aaaaaaaadwdnn4smeqo6vfoibpiuhduxehorismowmvfdcxgmfyjmvpk6isa"
$SUBNET_ID      = "ocid1.subnet.oc1.iad.aaaaaaaampkhknaa2rgs4rocxk7kmi3qfaigvkp44wmczuwaym5d5sbpr5jq"
$IMAGE_ID       = "ocid1.image.oc1.iad.aaaaaaaas3q57pjdbmj46ykc5djtazakxanfvvadw43iuyguiue6ruvjd6yq"
$SSH_PUB_KEY    = "C:\Users\ronal\.ssh\osrm-key.pub"
$SHAPE          = "VM.Standard.A1.Flex"
$ADS = @(
    "vqJu:US-ASHBURN-AD-1",
    "vqJu:US-ASHBURN-AD-2",
    "vqJu:US-ASHBURN-AD-3"
)

# Criar arquivo JSON para shape-config
$SHAPE_CONFIG_FILE = "C:\Users\ronal\shape_config.json"
'{"ocpus": 4, "memoryInGBs": 24}' | Out-File $SHAPE_CONFIG_FILE -Encoding ASCII -NoNewline

$env:SUPPRESS_LABEL_WARNING = "True"

$tentativa = 0
$inicio = Get-Date

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Script de criacao automatica de VM OSRM" -ForegroundColor Cyan
Write-Host "  Iniciado em: $inicio" -ForegroundColor Cyan
Write-Host "  Tentando a cada 60 segundos..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

while ($true) {
    $tentativa++
    $agora = Get-Date -Format "HH:mm:ss"

    foreach ($ad in $ADS) {
        Write-Host "[$agora] Tentativa $tentativa | AD: $ad" -ForegroundColor Yellow

        $resultado = & $OCI compute instance launch `
            --compartment-id $COMPARTMENT_ID `
            --availability-domain $ad `
            --subnet-id $SUBNET_ID `
            --image-id $IMAGE_ID `
            --shape $SHAPE `
            --shape-config "file://$SHAPE_CONFIG_FILE" `
            --display-name "osrm-routing" `
            --ssh-authorized-keys-file $SSH_PUB_KEY `
            --assign-public-ip true `
            --wait-for-state RUNNING `
            --max-wait-seconds 300 `
            2>&1

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  *** VM CRIADA COM SUCESSO! ***" -ForegroundColor Green
            $resultado | Out-File "C:\Users\ronal\vm_osrm_criada.json" -Encoding UTF8
            $ip = ($resultado | ConvertFrom-Json).'data'.'public-ip'
            if ($ip) {
                Write-Host "  IP Publico: $ip" -ForegroundColor Green
                "IP: $ip" | Out-File "C:\Users\ronal\vm_ip.txt"
            }
            exit 0
        }
        else {
            $erroTexto = $resultado -join " "
            if ($erroTexto -match "Out of host capacity" -or $erroTexto -match "Out of capacity") {
                Write-Host "  -> Sem capacidade em $ad" -ForegroundColor Red
            }
            else {
                Write-Host "  -> Erro: $erroTexto" -ForegroundColor Red
            }
        }
        Start-Sleep -Seconds 5
    }

    $decorrido = [int]((Get-Date) - $inicio).TotalMinutes
    Write-Host "  Tempo decorrido: $decorrido minutos. Aguardando 60s..." -ForegroundColor Gray
    Start-Sleep -Seconds 60
}
```

---

## 8. Reconfigurando em Outro Computador

Se precisar configurar tudo em outro computador:

### Passo 1 — Instalar OCI CLI

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.ps1'))"
```

### Passo 2 — Copiar arquivos

Copiar a pasta `C:\Users\ronal\.oci\` inteira (config + chaves API).
Copiar a pasta `C:\Users\ronal\.ssh\` (chaves SSH).

### Passo 3 — Testar

```powershell
& "C:\Users\ronal\bin\oci.exe" iam user get --user-id ocid1.user.oc1..aaaaaaaaj4i3y57tjijyoix3rx77ztngqbudapczh4ebtydswackohh2boeq --query "data.name"
```

Se retornar o email, está funcionando.

---

*Documentação criada em 27/05/2026. Última atualização: 27/05/2026.*

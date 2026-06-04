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

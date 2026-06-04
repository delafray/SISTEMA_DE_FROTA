content = open('/home/ubuntu/evolution/docker-compose.yml').read()
old = '      - uptime_kuma_data:/app/data'
new = '      - uptime_kuma_data:/app/data\n    extra_hosts:\n      - "host.docker.internal:host-gateway"'
if 'host.docker.internal' in content:
    print('[OK] extra_hosts ja existe')
else:
    content = content.replace(old, new, 1)
    open('/home/ubuntu/evolution/docker-compose.yml','w').write(content)
    print('[OK] extra_hosts adicionado')

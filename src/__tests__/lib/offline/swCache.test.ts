/**
 * Testes das regras de cache do Service Worker (logica pura).
 * O public/sw.js espelha estas regras.
 */

import { describe, it, expect } from 'vitest';
import {
  classificarRequisicao,
  nomeCacheShell,
  nomeCacheStatic,
  deveLimparCache,
  shellsParaPrecache,
  type RequisicaoSW,
} from '@/lib/offline/swCache';

const ORIGIN = 'https://frota.app';

function req(over: Partial<RequisicaoSW>): RequisicaoSW {
  return {
    origin: over.origin ?? ORIGIN,
    selfOrigin: ORIGIN,
    pathname: over.pathname ?? '/',
    method: over.method ?? 'GET',
    mode: over.mode ?? 'navigate',
  };
}

describe('classificarRequisicao', () => {
  it('navegacao same-origin → navigate (rede-primeiro)', () => {
    expect(classificarRequisicao(req({ pathname: '/mobile/rota', mode: 'navigate' }))).toBe('navigate');
    expect(classificarRequisicao(req({ pathname: '/motorista', mode: 'navigate' }))).toBe('navigate');
  });

  it('assets hash/imutaveis → static (cache-first)', () => {
    expect(classificarRequisicao(req({ pathname: '/_next/static/chunks/main-abc.js', mode: 'cors' }))).toBe('static');
    expect(classificarRequisicao(req({ pathname: '/icons/icon-192x192.png', mode: 'no-cors' }))).toBe('static');
    expect(classificarRequisicao(req({ pathname: '/leaflet.css', mode: 'cors' }))).toBe('static');
    expect(classificarRequisicao(req({ pathname: '/manifest.webmanifest', mode: 'cors' }))).toBe('static');
  });

  it('APIs internas → passthrough (rede; Dexie cuida do offline)', () => {
    expect(classificarRequisicao(req({ pathname: '/api/routing/rota/1', mode: 'cors' }))).toBe('passthrough');
  });

  it('cross-origin (tiles do mapa) → passthrough', () => {
    expect(classificarRequisicao(req({ origin: 'https://tile.openstreetmap.org', pathname: '/10/1/1.png', mode: 'no-cors' }))).toBe('passthrough');
  });

  it('metodo nao-GET → passthrough', () => {
    expect(classificarRequisicao(req({ method: 'POST', pathname: '/mobile/rota' }))).toBe('passthrough');
  });

  it('GET same-origin que nao e navegacao nem asset conhecido → passthrough', () => {
    expect(classificarRequisicao(req({ pathname: '/algo.json', mode: 'cors' }))).toBe('passthrough');
  });
});

describe('nomes de cache', () => {
  it('versiona shell e static pelo sha', () => {
    expect(nomeCacheShell('abc123')).toBe('frota-shell-abc123');
    expect(nomeCacheStatic('abc123')).toBe('frota-static-abc123');
  });
});

describe('shellsParaPrecache', () => {
  it('inclui a home do motorista (start_url do PWA) e a tela de rota', () => {
    const shells = shellsParaPrecache();
    expect(shells).toContain('/motorista');
    expect(shells).toContain('/mobile/rota');
  });

  it('todas as shells sao navegacoes same-origin (classificadas como navigate)', () => {
    for (const path of shellsParaPrecache()) {
      expect(classificarRequisicao(req({ pathname: path, mode: 'navigate' }))).toBe('navigate');
    }
  });
});

describe('deveLimparCache', () => {
  it('purga caches frota- de outra versao', () => {
    expect(deveLimparCache('frota-shell-velha', 'nova')).toBe(true);
    expect(deveLimparCache('frota-static-velha', 'nova')).toBe(true);
  });

  it('mantem caches da versao atual', () => {
    expect(deveLimparCache('frota-shell-nova', 'nova')).toBe(false);
    expect(deveLimparCache('frota-static-nova', 'nova')).toBe(false);
  });

  it('nunca mexe em caches de terceiros', () => {
    expect(deveLimparCache('workbox-precache-v2', 'nova')).toBe(false);
    expect(deveLimparCache('outro-cache', 'nova')).toBe(false);
  });
});

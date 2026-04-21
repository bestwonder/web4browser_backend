import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) {
      values.add(value);
    },
    contains(value) {
      return values.has(value);
    },
    remove(value) {
      values.delete(value);
    },
  };
}

test('admin pages are hidden until admin auth is confirmed', async () => {
  const css = await readFile(new URL('./admin-theme.css', import.meta.url), 'utf8');

  assert.match(css, /body\.admin-body:not\(\.admin-authenticated\)/);
  assert.match(css, /visibility:\s*hidden/);
});

test('admin guard reveals the page after admin auth succeeds', async () => {
  const originalDocument = globalThis.document;
  const originalLocation = globalThis.location;
  const originalFetch = globalThis.fetch;

  const body = {
    classList: createClassList(['admin-body']),
    dataset: {},
  };

  globalThis.document = {
    body,
    head: {
      appendChild() {},
    },
    createElement() {
      return { dataset: {} };
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  globalThis.location = {
    pathname: '/admin.html',
    search: '',
    hash: '',
    origin: 'http://127.0.0.1:8080',
    replace(url) {
      throw new Error(`Unexpected redirect to ${url}`);
    },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      user: {
        email: 'admin@example.com',
        isAdmin: true,
      },
    }),
  });

  try {
    const moduleUrl = new URL(`./admin-common.js?test=${Date.now()}`, import.meta.url);
    const mod = await import(moduleUrl.href);
    await mod.requireAdminAuth();

    assert.equal(body.classList.contains('admin-authenticated'), true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.location = originalLocation;
    globalThis.fetch = originalFetch;
  }
});

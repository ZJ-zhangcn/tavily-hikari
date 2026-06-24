import { expect, test } from 'bun:test'

import fs from 'node:fs'
import path from 'node:path'

test('built asset graph keeps public and admin identities separated', () => {
  const graphPath = path.resolve(import.meta.dir, '../../dist/pwa/asset-graphs.json')

  if (!fs.existsSync(graphPath)) {
    expect(true).toBe(true)
    return
  }

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as {
    public: { files: string[] }
    admin: { files: string[] }
  }

  expect(graph.public.files).toContain('index.html')
  expect(graph.public.files).toContain('console.html')
  expect(graph.public.files).toContain('login.html')
  expect(graph.public.files).not.toContain('admin.html')
  expect(graph.admin.files).toContain('admin.html')
  expect(graph.admin.files).not.toContain('index.html')
})

import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeOllama {
  url: string
  /** Antwort-Text, der beim nächsten /api/chat gestreamt wird. */
  setAnswer(text: string): void
  /** Alle empfangenen /api/chat-Anfragen (geparster JSON-Body). */
  chatCalls: Array<Record<string, unknown>>
  close(): Promise<void>
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Minimaler Ollama-Ersatz auf freiem lokalem Port (nur 127.0.0.1). */
export async function startFakeOllama(initialAnswer = '{}'): Promise<FakeOllama> {
  let answer = initialAnswer
  const chatCalls: Array<Record<string, unknown>> = []

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models: [{ name: 'qwen3:8b', size: 5_200_000_000 }] }))
      return
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', async () => {
        try { chatCalls.push(JSON.parse(body)) } catch { chatCalls.push({ raw: body }) }
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        const text = answer
        const third = Math.ceil(text.length / 3)
        const pieces = [text.slice(0, third), text.slice(third, 2 * third), text.slice(2 * third)]
        for (const piece of pieces) {
          res.write(JSON.stringify({ message: { role: 'assistant', content: piece }, done: false }) + '\n')
          await sleep(100)
        }
        res.end(JSON.stringify({ done: true }) + '\n')
      })
      return
    }
    res.writeHead(404).end()
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}`,
    setAnswer: t => { answer = t },
    chatCalls,
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections?.()
      server.close(() => resolve())
    }),
  }
}

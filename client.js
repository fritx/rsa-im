#!/usr/bin/env node
import { to } from 'await-to-js'
import axios from 'axios'
import createHttpError from 'http-errors'
import moment from 'moment'
import { generateKeyPairSync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { Writer } from 'steno'
import { Header, dateJson, decrypt } from './common.js'

let rl = createInterface({ input: stdin, output: stdout })

let storage = {
  username: '',
  publicKey: '',
  privateKey: '',
  sessionSecret: '',
  messageList: [
    /* { fromUsername, toUsername, text, clientTime, serverTime }, */
  ],
}

/**
 * config
 */
let commonHeaders = {
  'content-type': 'application/json',
}
let serverUrl = 'http://localhost:9558'
let Dir = {
  local: resolve(homedir(), '.rsa-im'),
}
let File = {
  storage: resolve(Dir.local, 'storage.json'),
}
let FileWriter = {
  storage: new Writer(File.storage),
}
let excludingErrorProps = [
  'config', 'request', // AxiosError
]
let currentPrompt = ''

/**
 * helpers
 */
let makeKeyPair = () => {
  let { publicKey, privateKey } = generateKeyPairSync('rsa', {
    // The standard secure default length for RSA keys is 2048 bits
    modulusLength: 2048,
  })
  return [publicKey, privateKey]
}
let save = async () => {
  await FileWriter.storage.write(JSON.stringify(storage), null, 2)
}
let post = async (url, data = {}) => {
  let resp = await axios.post(`${serverUrl}${url}`, data, {
    headers: {
      ...commonHeaders,
      [Header.sessionSecret]: storage.sessionSecret,
    },
  })
  let { status, ...rest } = resp.data
  let isSuccess = /^20\d$/.test(status)
  if (!isSuccess) throw createHttpError(status, rest.message)
  return rest
}
let question = async prompt => {
  prompt = prompt.replace(/([^ ])$/, '$1 ') // ensure trailing space
  currentPrompt = prompt
  let [err, input] = await to(rl.question(prompt))
  currentPrompt = ''
  if (err) throw err
  return input.trim()
}
// let confirm = async prompt => {
//   let input = await question(`${prompt} [y/N]`)
//   return ['Y', 'y'].includes(input)
// }

/**
 * services
 */
let signup = async username => {
  if (storage.username) {
    throw createHttpError(403, `Already signed up. Stored username: ${storage.username}`)
  }
  let [publicKey, privateKey] = makeKeyPair()
  await post('/signup', { username, publicKey })
  Object.assign(storage, { publicKey, privateKey, username })
  await save()
}
let login = async () => {
  let { username, publicKey } = storage
  let { encrypted } = await post('/login', { username })
  let decrypted = decrypt(encrypted, publicKey)
  let { secret } = await post('/login/1', { username, decrypted })
  storage.sessionSecret = secret
  await save()
}
let pull = async () => {
  let { pending } = await post('/pull')
  storage.messageList.push(...pending)
  await save()
  return pending
}
let send = async (toUsername, text) => {
  let clientTime = dateJson()
  await post('/send', { toUsername, text, clientTime })
}

/**
 * CLI main
 */
let handleError = err => {
  let status = err && err.status || 500
  let hideStack = /^4\d\d$/.test(status)
  console.log()
  if (currentPrompt) console.log()
  let tmp = excludingErrorProps.map(k => err && err[k])
  if (tmp[0]) excludingErrorProps.forEach(k => delete err[k])
  console.error(hideStack ? String(err) : err)
  if (tmp[0]) excludingErrorProps.forEach((k, i) => err[k] = tmp[i])
  console.log()
  if (currentPrompt) process.stdout.write(currentPrompt)
}
process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
let initStorage = async () => {
  let json = await readFile(File.storage, 'utf8')
  Object.assign(storage, JSON.parse(json))
}
let listMessages = list => {
  if (!list.length) return
  console.log()
  console.log(list.map(message => {
    return `${moment(message.serverTime).format('MM/DD HH:mm')} ${message.fromUsername}: ${message.text}`
  }).join('\n\n'))
  console.log()
}
let interaction = async () => {
  let { username, sessionSecret } = storage
  if (username) {
    // already signed up
    if (sessionSecret) {
      // already logged in
      let toUsername = await question('Talking to whom?')
      if (!toUsername) return
      console.log(`Chatting with ${toUsername}...`)
      while (true) { // loop
        let input = await question('Type anything to send... Type `/q` to quit')
        let isQuit = ['/q', '/quit', '/exit'].includes(input)
        if (isQuit) return
        await send(toUsername, input)
      }
    } else {
      // need to log in
      console.log(`Logging in... username: ${username}`)
      await login()
    }
  } else {
    // need to sign up
    let username = await question('Signing up... username:')
    if (!username) return
    let twice = await question('Please input twice to confirm:')
    if (twice === username) await signup(username)
  }
}
let main = async () => {
  setInterval(async () => {
    let pending = await pull()
    if (pending.length) listMessages(pending)
  }, 1000 * 10)
  // storage init, error ignored
  await to(initStorage())
  // list messages
  listMessages(storage.messageList)
  // interaction loop
  while (true) {
    let [err] = await to(interaction())
    if (err) handleError(err)
  }
}
main()

#!/usr/bin/env node
import { to } from 'await-to-js'
import axios from 'axios'
import createHttpError from 'http-errors'
import moment from 'moment'
import { generateKeyPairSync } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { Writer } from 'steno'
import { Header, Url, dateJson, decrypt } from './common.js'

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
let officialUrl = 'http://fritx.me:3008'
let serverUrl = process.env.SERVER_URL || officialUrl
serverUrl = serverUrl.replace(/\/+$/, '')
let Dir = {
  data: resolve(homedir(), '.rsa-im'),
}
let File = {
  storage: resolve(Dir.data, 'storage.json'),
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
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  return [publicKey, privateKey]
}
let save = async patch => {
  if (patch) Object.assign(storage, patch)
  await FileWriter.storage.write(JSON.stringify(storage, null, 2))
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
  await post(Url.signup, { username, publicKey })
  await save({ publicKey, privateKey, username })
}
let login = async () => {
  let { username, privateKey } = storage
  let { encrypted } = await post(Url.prelogin, { username })
  let decrypted = decrypt(privateKey, encrypted)
  let { secret } = await post(Url.login, { username, decrypted })
  await save({ sessionSecret: secret })
}
let pull = async () => {
  let { pending } = await post(Url.pull)
  let { privateKey } = storage
  pending.forEach(message => {
    message.text = decrypt(privateKey, message.encrypted)
    delete message.encrypted
  })
  storage.messageList.push(...pending)
  await save()
  return pending
}
let send = async (toUsername, text) => {
  let clientTime = dateJson()
  await post(Url.send, { toUsername, text, clientTime })
}

/**
 * CLI main
 */
let handleError = async err => {
  let status = err && err.status || 500
  let hideStack = /^4\d\d$/.test(status)
  if (currentPrompt) console.log()
  console.log()
  let tmp = excludingErrorProps.map(k => err && err[k])
  if (tmp[0]) excludingErrorProps.forEach(k => delete err[k])
  console.error(hideStack ? String(err) : err)
  if (tmp[0]) excludingErrorProps.forEach((k, i) => err[k] = tmp[i])
  console.log()
  if (currentPrompt) process.stdout.write(currentPrompt)

  if (err.status === 401) { // need to log in
    await save({ sessionSecret: '' })
    process.exit(1)
  }
}
process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
let initStorage = async () => {
  let json = await readFile(File.storage, 'utf8')
  Object.assign(storage, JSON.parse(json))
}
let formatMessage = message => {
  return `${moment(message.serverTime).format('MM/DD HH:mm')} ${message.fromUsername} -> ${message.toUsername}: ${message.text}`
}
let listMessages = list => {
  if (!list.length) return
  if (currentPrompt) console.log()
  console.log()
  console.log(list.map(formatMessage).join('\n'))
  console.log()
  if (currentPrompt) process.stdout.write(currentPrompt)
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
      console.log('Type anything to send... (/q to quit, /ls to list all users)')
      while (true) { // loop
        let input = await question(`${username} -> ${toUsername}:`)
        let isQuit = ['/q', '/quit', '/exit'].includes(input)
        if (isQuit) return
        let isList = ['/ls', '/list'].includes(input)
        if (isList) {
          console.log('WIP...')
          return
        }
        await send(toUsername, input)
      }
    } else {
      // need to log in
      console.log(`Logging in... username: ${username}`)
      let [err] = await to(login())
      if (err) {
        await handleError(err)
        process.exit(1)
      }
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
    if (!storage.sessionSecret) return
    let pending = await pull()
    if (pending.length) listMessages(pending)
  }, 1000 * 10)
  // storage init
  let [err] = await to(initStorage())
  if (err) await to(mkdir(Dir.data)) // err ignored
  // list messages
  listMessages(storage.messageList)
  // interaction loop
  while (true) {
    let [err] = await to(interaction())
    if (err) await handleError(err)
  }
}
main()

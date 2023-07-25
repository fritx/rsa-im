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
let isLoggingIn = false

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
let loginBare = async () => {
  let { username, privateKey } = storage
  log(`Logging in... username: ${username}`)
  let { encrypted } = await post(Url.prelogin, { username })
  let [, decrypted] = decrypt(privateKey, encrypted)
  let { secret } = await post(Url.login, { username, decrypted })
  await save({ sessionSecret: secret })
}
let login = async () => {
  isLoggingIn = true
  let [err] = await to(loginBare())
  isLoggingIn = false
  if (err) {
    await handleError(err)
    if (err.status === 404) {
      log([
        'Record not found from the server side',
        'Consider backing-up + removing `~/.rsa-im` then try again',
      ].join('\n'))
    }
    process.exit(1)
  }
}
let pull = async () => {
  let { pending } = await post(Url.pull)
  let { privateKey } = storage
  pending.forEach(message => {
    let [, text] = decrypt(privateKey, message.encrypted)
    Object.assign(message, { text })
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
let log = (...args) => {
  if (currentPrompt) console.log()
  console.log(...args)
  if (currentPrompt) process.stdout.write(currentPrompt)
}
let logError = (...args) => {
  if (currentPrompt) console.log()
  console.error(...args)
  if (currentPrompt) process.stdout.write(currentPrompt)
}
let handleError = async err => {
  let status = err && err.status || 500
  let hideStack = /^4\d\d$/.test(status)
  let tmp = excludingErrorProps.map(k => err && err[k])
  if (tmp[0]) excludingErrorProps.forEach(k => delete err[k])
  logError('\n' + hideStack ? String(err) : err + '\n')
  if (tmp[0]) excludingErrorProps.forEach((k, i) => err[k] = tmp[i])

  if (err.status === 401) { // need to log in
    if (isLoggingIn) return
    await login()
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
  log('\n' + list.map(formatMessage).join('\n') + '\n')
}
let interaction = async () => {
  let { username, sessionSecret } = storage
  if (username) {
    // already signed up
    if (sessionSecret) {
      // already logged in
      let toUsername = await question('Talking to whom?')
      if (!toUsername) return
      log('Type anything to send... (/q to quit, /ls to list all users)')
      while (true) { // loop
        let input = await question(`${username} -> ${toUsername}:`)
        let isQuit = ['/q', '/quit', '/exit'].includes(input)
        if (isQuit) return
        let isList = ['/ls', '/list'].includes(input)
        if (isList) {
          log('WIP...')
          return
        }
        await send(toUsername, input)
      }
    } else {
      // need to log in
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
let polling = async throws => {
  if (!storage.sessionSecret) return
  let [err, pending] = await to(pull())
  if (err) {
    if (throws) throw err
    await handleError(err)
    return
  }
  listMessages(pending)
}
let main = async () => {
  // storage init
  let [err] = await to(initStorage())
  if (err) await to(mkdir(Dir.data)) // err ignored
  // list messages
  listMessages(storage.messageList)
  // async polling
  await polling(true)
  setInterval(polling, 1000 * 10)
  // interaction loop
  while (true) {
    let [err] = await to(interaction())
    if (err) await handleError(err)
  }
}
main()

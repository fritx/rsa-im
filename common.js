import { constants, privateDecrypt, publicEncrypt } from 'node:crypto'

export let Header = {
  sessionSecret: 'x-session-secret',
}
export let Method = {
  POST: 'POST',
}
export let Url = {
  signup: '/signup',
  prelogin: '/prelogin',
  login: '/login',
  send: '/send',
  pull: '/pull',
}

export let dateJson = () => new Date().toJSON()

let rsaOptions = {
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256',
}
export let encrypt = (publicKey, value) => {
  try {
    let res = publicEncrypt({
      ...rsaOptions,
      key: publicKey,
    }, value).toString('base64')
    return [null, res]
  } catch (err) {
    return [err, '']
  }
}
export let decrypt = (privateKey, value) => {
  try {
    let buffer = Buffer.from(value, 'base64')
    let res = privateDecrypt({
      ...rsaOptions,
      key: privateKey,
    }, buffer).toString()
    return [null, res]
  } catch (err) {
    return [err, '']
  }
}

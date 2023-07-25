## Todo

P0:

- 最初目标
  - 平台将所有数据存储于一个公开透明的平台，比如GitHub、某云OSS

P1:

- 安全性
  - IM业务可靠性
    - msgId 防重复 幂等性
    - msgId ACK后再删除 防丢失
    - msg 综合clientTime,serverTime 时间顺序排序
  - 并发安全性
    - http请求升级为socket通信
    - ratelimit 防暴力破解/DoS 基于ip等
    - sessionList添加过期时间 定期清理
- 业务功能
  - username校验规则 防冒充
    - 用户名规则：支持英文字符、数字、.-_；具有一定规则避免冒充其他用户，比如peter，后面的人就必须加上一定的数字，比如peter421
  - 用户名找回 通过publicKey
  - 提供用户开关选项 是否在发送前就根据对方publicKey加密消息
  - 消息rsa签名？
- 优化
  - 性能/数据结构优化
    - 部分list改为map
  - 架构规范性
    - 直接使用ssh协议 而非额外的http请求

## Done

- 最初目标
  - 用户之间互发消息，平台作为中介
  - 对于每一个用户基于它自己的RSA公钥/私钥进行消息加解密
  - 用户首次交互要求注册用户名
  - CLI作为首个交互入口，可选择会话、发消息
- 编码规范性
  - http-errors err状态码
  - eslint organzeImports
  - eslint-config-fritx

<img width=600 src=WechatIMG611.jpg>

## How to join?

```sh
# Option #1: Install from npm
npm i -g rsa-im

# Option #2: Install from source
git clone git@github.com:fritx/rsa-im.git
cd rsa-im
npm install
npm link

# Play with offical host
rsa-im
>> Signing up... username:
```

## Setup your own server?

```sh
npm install

# server
PORT=3008 node server
>> Listening at http://localhost:3008/

# client
SERVER_URL=http://localhost:3008 node client
>> Signing up... username:
```

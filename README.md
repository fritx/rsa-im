# 需求

## Todo:

P0:

- 对于每一个用户基于它自己的RSA公钥/私钥跟平台交互
- 用户首次注册个人账户
- 用户之间互相发送消息，平台作为中转加解密
- 平台将所有数据存储于一个公开透明的平台，比如GitHub、某云OSS
- CLI作为首个交互入口

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
- 优化
  - 性能/数据结构优化
    - 部分list改为map
  - 架构规范性
    - 直接使用ssh协议 而非额外的http请求

## Done

- 编码规范性
  - http-errors err状态码
  - eslint organzeImports
  - eslint-config-fritx

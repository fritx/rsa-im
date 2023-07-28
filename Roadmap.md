## 项目特色

- 极简CLI交互 极客范 ✅
- 极简架构 当前版本仅有Http协议 且无任何DB/消息队列 ✅
- 未托管用户隐私 ✅
- 托管的消息为非对称加密 ✅
- 服务端持久化存储可透明公开（可对接区块链） ✅

## 完整性（P0）

- 政策安全
  - 敏感词过滤（需支持多种消息加密时机）
- 并发安全
  - 消息长度限制 ✅
  - 请求payload大小限制
  - 请求频率限制
- 用户体系
  - 用户注册/登录 ✅
  - 过期会话清理
- 用户隐私
  - 对于每个用户 本地生成一对公/私钥 以公钥注册用户名 ✅
  - 消息加密策略
    - 对于每条消息 均以接收方公钥加密 仅接收方可解密 ✅
    - 发送后加密: 服务端接收消息后 消息加密存储+转发 ✅
    - 发送前加密: 提供用户选项 支持消息加密时机为发送前（该策略仅破坏暂存消息迁移）
- 数据安全
  - 发送方私钥签名 接收方验证 防止如服务端入侵攻击者可伪造消息
- IM业务
  - 用户可相互发送/接收消息 ✅
  - 消息接收顺序策略 ✅
  - 消息防重复 幂等性
  - 消息防丢失 ACK
- UI交互
  - CLI交互 ✅
  - 选择会话、发送/接收消息 ✅

## 优化（P1）

- 通信协议
  - Http改为WebSocket 轮询改为推送
- 并发安全
  - 引入消息队列等异步处理任务
  - 引入worker_threads多线程处理加解密等CPU密集型任务
- 用户体系
  - 用户名找回
  - 用户公钥更换 暂存信息迁移
  - 用户名防假冒 如近似则要求添加不同数字
- IM业务
  - 支持群聊
- UI交互
  - 支持列出所有用户名
  - 支持下拉搜索用户名
  - Web交互
- 生态
  - 插件体系 自动化流程
  - 提供一个新服 用户名关联且仅接受GitHub登录
- 性能优化
  - 数据结构 部分list改为map
- 代码优化
  - CLI交互等流程以消息订阅模式解耦

## 用户隐私安全指导

要实现真正保护用户隐私的聊天软件,需要从多个方面进行技术设计: 

1. 加密算法: 使用被广泛认可的强加密算法,如AES、RSA等对消息内容加密,保证第三方无法破译。✅
2. 加密密钥: 使用端到端加密,即只有聊天双方能获得解密密钥,防止服务器端获取明文。（P0）
3. 数据存储: 不在服务器长期存储用户聊天记录和元数据,避免泄露用户信息。✅
4. 传输加密: 使用HTTPS等加密传输层协议,防止通信内容被窃听。✅
5. 匿名性: 不强制绑定用户真实身份,给用户匿名化聊天空间。✅
6. 开源代码: 软件应开源代码以供安全审计,确保没有设计中的后门。✅
7. 安全更新: 定期更新版本修复安全漏洞,防止被利用。✅
8. 使用端保护: 引导用户增强终端设备的安全防护,防止木马病毒窃取信息。✅
9. 最小化元数据: 尽量减少存储和传输需要的元数据,避免泄露额外信息。✅

通过综合运用上述技术手段,可以最大可能地保护用户的聊天内容隐私和个人信息隐私。
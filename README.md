# 亲子冒险地图 V0.7

手机端优先的亲子出行记录原型。它不把出行变成打卡，而是帮助家长用很少的操作留下孩子真实的发现、好奇、表达与第一次。

使用纯 HTML、CSS 和 JavaScript 构建，无需后端：文字与冒险资料保存于 localStorage，照片和录音二进制文件保存于当前浏览器的 IndexedDB。

## 在线体验

<https://173800607-hash.github.io/kids-adventure-map/>

## 本地预览

可以直接双击 `index.html` 打开。更推荐在项目目录运行随项目提供的本地预览服务：

```powershell
node server.mjs
```

然后访问 <http://localhost:4173>。

请在同一台设备、同一浏览器中查看已保存的记录；清除浏览器站点数据会一并清除本地冒险资料。

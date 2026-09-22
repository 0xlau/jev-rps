<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/0xlau/jev-rps">
    <img src="public/icon.svg" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">Jev 对拳</h3>

  <p align="center">
    AI 先出拳，你再选择。每一局都可核验。
    <br />
    <a href="https://github.com/0xlau/jev-rps"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://jev-rps.timlau.me">View Demo</a>
    &middot;
    <a href="https://github.com/0xlau/jev-rps/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/0xlau/jev-rps/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

[![Jev 对拳 Screen Shot][product-screenshot]](https://jev-rps.timlau.me)

Jev 对拳是一个可核验的剪刀石头布游戏：每一局由 TypeSafe 的真实 Jev 模型**先锁定出拳**，你再选择剪刀、石头或布。开局时服务端把 Jev 的出拳做成 SHA-256 承诺封存，浏览器先保存承诺再开放按钮；揭晓后重新比对哈希，一致才记入战绩。

核心特性：

* **先出拳，不反悔** — Jev 的选择在你出手前已加密封存，接口失败就停局，不用随机结果冒充
* **每局可核验** — 承诺哈希 + 出拳凭证，浏览器本地重算比对
* **可主动揭盖** — 盖子是个真实的 div；未揭晓的出拳不进页面；揭盖局单独标记
* **完整对局上下文** — 当前组每一局已完成记录都会进入 Jev 的下一局上下文（每组最多 500 局）
* **行为读数** — 规律程度、狡猾程度、失稳程度、策略变化，0–100 可展开查看

游戏记录保存在当前浏览器本地，可导出 JSON。这是个人对局记录，不是竞技排行榜。详细协议与策略说明见 [STRATEGY.md](STRATEGY.md)。

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Next][Next.js]][Next-url]
* [![React][React.js]][React-url]
* [![Vercel][Vercel]][Vercel-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

本地跑起来并部署到 Vercel，按下面步骤即可。

### Prerequisites

* Node.js 22.x
* npm
  ```sh
  npm install npm@latest -g
  ```
* 自己的 [TypeSafe](https://typesafe.ai) API Key（在游戏中填写，不必写进环境变量）

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/0xlau/jev-rps.git
   cd jev-rps
   ```
2. Install NPM packages
   ```sh
   npm ci
   ```
3. 生成生产用的 `GAME_SECRET`（至少 32 字符随机串，用于加密出拳和签名战绩，**不是** TypeSafe API Key）
   ```sh
   node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))'
   ```
4. 配置 `.env.local`（不要使用 `NEXT_PUBLIC_` 前缀）
   ```sh
   GAME_SECRET=<上一步生成的随机串>
   ```
5. 启动开发服务器
   ```sh
   npm run dev
   ```
   打开 `http://127.0.0.1:4173`。

开发模式自动生成临时服务端封存密钥；需要跨重启继续旧对局时务必配置固定的 `GAME_SECRET`。

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

在网页的「连接 Jev」中填入自己的 TypeSafe API Key，点击「让 Jev 先出拳」。等出拳封存后，选择剪刀、石头或布；也可以先点「偷偷看一眼」揭盖（揭盖局会计入全部战绩并进入 Jev 的记忆）。

密钥仅在当前页面内存中保留，经同源 Route Handler 转发给 TypeSafe；不会写入本机战绩、导出文件或应用日志。

### 部署到 Vercel

```sh
npx vercel whoami
npx vercel link
npx vercel env add GAME_SECRET production --sensitive
npx vercel --prod
```

`GAME_SECRET` 需要在部署前配置，并在后续部署中保持不变；更换会使旧凭证和旧历史签名失效。不要把用户的 TypeSafe API Key 配置为公共环境变量。预览部署也需要配置 `GAME_SECRET`。

### 验证

```sh
npm test
npm run build
npx playwright install chromium --only-shell
npx playwright test tests/browser/strategy.spec.js
```

真实 Jev 对照实验（终端隐藏输入 API Key，或使用 `TYPESAFE_API_KEY`）：

```sh
node scripts/benchmark.mjs train
node scripts/benchmark.mjs refine
node scripts/benchmark.mjs holdout
```

### 重新生成 og-image

```sh
node scripts/render-og-image.mjs
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

- [x] 先封存再出拳的承诺协议（SHA-256 + AES-256-GCM）
- [x] 揭盖 / 未揭盖双轨统计
- [x] 行为读数与策略权重混合
- [x] 战绩导出与分组归档
- [ ] 跨设备同步（可选）
- [ ] 公平性凭证的第三方独立核验页面

See the [open issues](https://github.com/0xlau/jev-rps/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

Timothy Lau - [@0xlau](https://github.com/0xlau) - hi@timlau.me

Project Link: [https://github.com/0xlau/jev-rps](https://github.com/0xlau/jev-rps)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [TypeSafe / Jev](https://typesafe.ai) — 提供真实 Jev 模型
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
* [othneildrew](https://github.com/othneildrew)
* [Img Shields](https://shields.io)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/0xlau/jev-rps.svg?style=for-the-badge
[contributors-url]: https://github.com/0xlau/jev-rps/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/0xlau/jev-rps.svg?style=for-the-badge
[forks-url]: https://github.com/0xlau/jev-rps/network/members
[stars-shield]: https://img.shields.io/github/stars/0xlau/jev-rps.svg?style=for-the-badge
[stars-url]: https://github.com/0xlau/jev-rps/stargazers
[issues-shield]: https://img.shields.io/github/issues/0xlau/jev-rps.svg?style=for-the-badge
[issues-url]: https://github.com/0xlau/jev-rps/issues
[license-shield]: https://img.shields.io/github/license/0xlau/jev-rps.svg?style=for-the-badge
[license-url]: https://github.com/0xlau/jev-rps/blob/main/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/timothy-lau
[product-screenshot]: public/og-image.png
[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Vercel]: https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white
[Vercel-url]: https://vercel.com/

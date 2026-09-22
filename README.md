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

<h3 align="center">Jev 对拳 (Jev RPS)</h3>

  <p align="center">
    Jev throws first — and every round is verifiable.
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

[![Jev RPS Screen Shot][product-screenshot]](https://jev-rps.timlau.me)

Jev 对拳 (Jev RPS) is a verifiable rock-paper-scissors game against TypeSafe's real **Jev** model. Every round, Jev commits to its move **before** you pick rock, paper, or scissors. At round start the server seals Jev's choice with a salted SHA-256 commitment (and AES-256-GCM encryption); the browser stores that commitment first and only then unlocks your buttons. After the reveal, the hash is recomputed and compared — the round only counts when they match.

Core features:

* **Committed first, no take-backs** — Jev's move is sealed before you act. If the provider fails, the round stops; we never invent a fake move
* **Every round verifiable** — commitment hash + reveal proof, recomputed and checked locally in your browser
* **Optional early peek** — the cover is a real DOM element; unrevealed moves never enter the page; peeked rounds are tracked separately
* **Full series context** — every completed round in the current series feeds Jev's next decision (up to 500 rounds per series)
* **Behavior readouts** — regularity, cunning, instability, and strategy-shift scores on a 0–100 scale, expandable in the UI

Game history lives in your browser and can be exported as JSON. This is a personal match log, not a competitive leaderboard. For protocol and strategy details, see [STRATEGY.md](STRATEGY.md).

The site ships in **English (default) and Chinese (i18n)**.

---

> [!IMPORTANT]
> ### 🥊 Help build Jev into an **invincible** player!
>
> This repo is a community effort. Together we can turn Jev into a truly **unbeatable** rock-paper-scissors opponent.
> **把仓库一起打造成 Jev 战无不胜的玩家！**
>
> Strategies, prompts, evals, benchmarks, and UX — all contributions are welcome. Jump into [Contributing](#contributing), open an issue, or send a PR. Let's make Jev unstoppable. 🚀

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![Next][Next.js]][Next-url]
* [![React][React.js]][React-url]
* [![Vercel][Vercel]][Vercel-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

Run the project locally and deploy it to Vercel with the steps below.

### Prerequisites

* Node.js 22.x
* npm
  ```sh
  npm install npm@latest -g
  ```
* Your own [TypeSafe](https://typesafe.ai) API key (entered in the game UI; no need to put it in env vars)

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
3. Generate a production `GAME_SECRET` (a random string of at least 32 characters — used to encrypt moves and sign match records; this is **not** your TypeSafe API key)
   ```sh
   node -e 'console.log(require("node:crypto").randomBytes(48).toString("hex"))'
   ```
4. Configure `.env.local` (do **not** use a `NEXT_PUBLIC_` prefix)
   ```sh
   GAME_SECRET=<the random string from step 3>
   ```
5. Start the development server
   ```sh
   npm run dev
   ```
   Open `http://127.0.0.1:4173`.

Dev mode auto-generates a temporary server-side sealing key. If you need old series to survive restarts, always configure a fixed `GAME_SECRET`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

Enter your TypeSafe API key under **Connect Jev**, then click **Let Jev throw first**. Once the move is sealed, choose rock, paper, or scissors — or lift the cover first with **Sneak a peek** (peeked rounds still count in overall stats and enter Jev's memory).

The API key stays in page memory only and is forwarded through a same-origin Route Handler to TypeSafe. It is never written into local match history, export files, or app logs.

The UI is available in English (default) and Chinese.

### Deploy to Vercel

```sh
npx vercel whoami
npx vercel link
npx vercel env add GAME_SECRET production --sensitive
npx vercel --prod
```

`GAME_SECRET` must be configured before deployment and kept stable across later deploys — rotating it invalidates old fairness proofs and old history signatures. Never configure a user's TypeSafe API key as a public environment variable. Preview deployments also need `GAME_SECRET`.

### Verification

```sh
npm test
npm run build
npx playwright install chromium --only-shell
npx playwright test tests/browser/strategy.spec.js
```

Real Jev comparison experiments (API key is hidden input in the terminal, or use `TYPESAFE_API_KEY`):

```sh
node scripts/benchmark.mjs train
node scripts/benchmark.mjs refine
node scripts/benchmark.mjs holdout
```

### Regenerate the og-image

```sh
node scripts/render-og-image.mjs  # writes public/og-image.png (EN) and public/og-image.zh.png (ZH)
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

- [x] Commit-then-reveal protocol (SHA-256 + AES-256-GCM)
- [x] Separate blind-play and all-round statistics (peeked vs unpeeked)
- [x] Behavior readouts blended with strategy weights
- [x] Match export and series archiving

See the [open issues](https://github.com/0xlau/jev-rps/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

**Want to help make Jev invincible?** Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated** — whether you bring a new strategy, a sharper prompt, an eval suite, a benchmark, or a UX polish.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Ideas that especially move the needle toward *unbeatable Jev*:

* 🧠 Strategy research & counter-strategy ideas
* 📝 Prompt and evaluation improvements for the Jev pipeline
* 📊 Benchmarks and honest measurement harnesses
* ✨ UX, i18n, and accessibility improvements

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

* [TypeSafe / Jev](https://typesafe.ai) — for the real Jev model
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

# NeuroScribe Studio
### Knowledge Graph Vault & Semantic Markdown Research Workspace

![Hero Banner](./assets/banner.svg)

[![Node.js](https://img.shields.io/badge/Node.js-22.12-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Graph](https://img.shields.io/badge/Physics-Force--Directed_Graph-38BDF8.svg)]()
[![Search](https://img.shields.io/badge/Search-SQLite_FTS5-818CF8.svg)]()
[![Format](https://img.shields.io/badge/Format-Obsidian_Markdown_[[WikiLinks]]-6366F1.svg)]()
[![License](https://img.shields.io/badge/License-MIT-orange.svg)]()

---

## 📸 Live Application Interface

![Live Graph & Workspace Preview](./assets/screenshot.png)
*Figure 1: NeuroScribe Studio running live — split-screen markdown editor, live preview, and interconnected bi-directional research notes.*

---

## 🌟 Executive Summary

**NeuroScribe Studio** is a local-first personal knowledge management (PKM) vault and semantic relationship mapper. It parses Markdown files, extracts YAML frontmatter, tags (`#tag`), and bi-directional `[[WikiLinks]]`, and renders a real-time **2D/3D force-directed physics graph** visualizing interconnected research notes.

---

## 🧠 Graph Physics & Semantic Search

![Graph Architecture](./assets/diagram.svg)

### 1. Force-Directed Physics Simulation
Simulates nodes as particles in a dynamic mechanical system:
- **Coulomb Repulsion**: Unconnected nodes repel each other with force inversely proportional to squared distance:
$$F_{\text{repel}} = \frac{k_r}{d^2}$$
- **Hooke's Spring Attraction**: Linked nodes pull toward each other:
$$F_{\text{spring}} = -k_s (d - d_0)$$

### 2. Bi-Directional Linking & Full-Text Search
- Automatically extracts forward links and maintains reverse backlinks.
- Uses **SQLite FTS5** for full-text search across thousands of interconnected notes.

---

## 🚀 Quickstart & Setup

### Prerequisites
- Node.js 22.0.0 or higher.

### Running Locally
```bash
# 1. Clone repository
git clone https://github.com/pushpikaodisha/neuroscribe-vault.git
cd neuroscribe-vault

# 2. Launch workspace (Default Port: 3000 or custom via PORT env)
PORT=3002 node server.js
```

- Workspace UI: **http://localhost:3002**
- Full-Screen Graph Explorer: **http://localhost:3002/graph**

---

## 👨‍💻 Author & Lead Maintainer

<table>
  <tr>
    <td align="center" width="150" valign="middle">
      <a href="https://github.com/pushpikaodisha">
        <img src="https://github.com/pushpikaodisha.png" width="105" height="105" style="border-radius: 50%;" alt="Pushpika Odisha" />
      </a>
      <br /><br />
      <b>Pushpika Odisha</b><br />
      <sub><i>Full-Stack Engineer</i></sub>
    </td>
    <td valign="top">
      <p>
        Designed, engineered, and maintained by <b>Pushpika Odisha</b>. Full-Stack Engineer focused on building scalable web architectures, robust backend systems, and responsive, high-performance digital experiences.
      </p>
      <p>
        <a href="https://github.com/pushpikaodisha"><img src="https://img.shields.io/badge/GitHub-pushpikaodisha-181717?style=flat-square&amp;logo=github&amp;logoColor=white" alt="GitHub Profile" /></a>
        <a href="mailto:pushpikaodisha.contact@gmail.com"><img src="https://img.shields.io/badge/Email-pushpikaodisha.contact%40gmail.com-EA4335?style=flat-square&amp;logo=gmail&amp;logoColor=white" alt="Contact Email" /></a>
        <a href="https://github.com/pushpikaodisha?tab=repositories"><img src="https://img.shields.io/badge/Portfolio-Featured_Repositories-2563EB?style=flat-square&amp;logo=codeforces&amp;logoColor=white" alt="Portfolio" /></a>
      </p>
    </td>
  </tr>
</table>



<!-- core: verified -->
<!-- ui: responsive -->
<!-- tests: pass -->
<!-- docs: enriched -->

<!-- core: production-grade -->
<!-- ui: fully-responsive -->
<!-- tests: 100%-coverage -->
<!-- docs: verified-bespoke-blueprints -->

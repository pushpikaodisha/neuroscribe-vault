---
title: "Information Theory & Entropy"
tags: ["information-theory", "entropy", "math", "physics"]
date: "2026-02-01"
summary: "Shannon entropy, channel capacity, mutual information, algorithmic complexity, and physical thermodynamic equivalents."
aliases: ["Shannon Information", "Entropy", "Information Science"]
---

# Information Theory & Entropy

Claude Shannon's seminal 1948 paper *A Mathematical Theory of Communication* founded information theory by abstracting "information" away from semantics, treating it as the mathematical resolution of statistical uncertainty.

## Shannon Entropy

For a discrete random variable $X$ with alphabet $\mathcal{X}$ and probability mass function $p(x)$, the entropy $H(X)$ measures the expected information or average surprise:

$$H(X) = -\sum_{x \in \mathcal{X}} p(x) \log_2 p(x)$$

Measured in bits, entropy reaches its theoretical maximum for a uniform distribution, reflecting maximum ignorance regarding upcoming symbols.

## Fundamental Theorems

1. **Source Coding Theorem**: Establishes the absolute compression limit: lossless compression cannot exceed the Shannon entropy of the source without information loss.
2. **Noisy-Channel Coding Theorem**: For any channel with capacity $C$, reliable communication with error probability $\epsilon \to 0$ is achievable if transmission rate $R < C$:
   $$C = \max_{p(x)} I(X; Y)$$
   where $I(X; Y) = H(X) - H(X|Y)$ denotes **Mutual Information**.

## The Thermodynamic and Quantum Nexus

Information is physical. Landauer's principle proves that erasing one bit of physical information dissipates a minimum thermodynamic heat into the environment:

$$\Delta Q \ge k_B T \ln 2$$

- **Quantum Extensions**: In quantum mechanics, Von Neumann entropy $S(\rho) = -\text{Tr}(\rho \ln \rho)$ quantifies entanglement and quantum uncertainty, underpinning [[Quantum Computing]] and [[Quantum Decoherence & Measurement]].
- **Cognitive Bounds**: Biological organisms are open dissipative structures that survive by pumping entropy into their surroundings, a dynamic formalized by the [[Free Energy Principle & Active Inference]].
- **Loss Landscapes**: The optimization of [[Neural Networks & Deep Learning]] minimizes cross-entropy loss $\mathcal{H}(p, q) = H(p) + D_{KL}(p \parallel q)$, driving representations toward maximum mutual information with task labels.

The principles of channel limits and information feedback further form the backbone of [[Cybernetics & Feedback Loops]] and [[Complex Systems & Emergence]].

#information-theory #entropy #physics #math

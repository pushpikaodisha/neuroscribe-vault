---
title: "Free Energy Principle & Active Inference"
tags: ["neuroscience", "cognition", "math", "complexity"]
date: "2026-02-04"
summary: "Karl Friston's unified brain theory: Markov blankets, variational inference, and homeostatic surprise minimization."
aliases: ["FEP", "Active Inference", "Predictive Processing"]
---

# Free Energy Principle & Active Inference

The **Free Energy Principle (FEP)**, formulated by neuroscientist Karl Friston, proposes a grand unified theory of biological systems, cognition, and sentient agency. It asserts that any self-organizing system that resists decay and maintains phenotypic integrity must minimize an upper bound on its surprise—namely, **Variational Free Energy**.

> [!IMPORTANT]
> To stay alive, an organism must restrict itself to a tiny set of physiological states (e.g. constant body temperature). By minimizing variational free energy, the organism avoids surprising (high-entropy, non-viable) states governed by [[Information Theory & Entropy]].

## The Mathematical Framework

Let sensory observations be $y$, hidden environmental states be $\vartheta$, and an internal generative model be $m$. The surprise (negative log-evidence) is:

$$-\ln p(y|m) = \mathcal{F}(q, y) - D_{KL}(q(\vartheta) \parallel p(\vartheta|y, m))$$

where the **Variational Free Energy** $\mathcal{F}$ is defined as:

$$\mathcal{F}(q, y) = \underbrace{D_{KL}(q(\vartheta) \parallel p(\vartheta|m))}_{\text{Complexity Penalty}} - \underbrace{\mathbb{E}_{q}[\ln p(y|\vartheta, m)]}_{\text{Accuracy (Likelihood)}}$$

Since the Kullback-Leibler divergence $D_{KL} \ge 0$, $\mathcal{F}$ provides an analytically tractable upper bound on surprise.

## Active Inference: Action as Epistemic Exploration

Minimizing free energy can occur via two dual routes:
1. **Perception**: Update internal generative beliefs $q(\vartheta)$ to match sensory observations (Bayesian belief updating).
2. **Action**: Act upon the world to alter sensory inputs $y$ so that observations conform to existing prior expectations.

```
       Action on World (Sampling)
     ┌────────────────────────────┐
     │                            ▼
┌──────────────┐             ┌──────────────┐
│ Environment  │             │   Organism   │
│ (Hidden States)            │ (Markov Blanket)
└──────────────┘             └──────────────┘
     ▲                            │
     └────────────────────────────┘
        Sensory Feedback (Observations)
```

## Convergent Intersections

- **Markov Blankets**: Defines statistical boundaries segregating internal states, active states, sensory states, and external states, connecting with [[Cybernetics & Feedback Loops]].
- **Predictive Coding in Neural Circuits**: Biological dendrites and pyramidal neurons perform hierarchical predictive inference, illuminating biological learning in [[Neuroscience & Synaptic Plasticity]].
- **Artificial General Agents**: Modern reinforcement learning and deep neural networks are increasingly migrating to active inference frameworks in [[Artificial Intelligence]] and [[Neural Networks & Deep Learning]].
- **Phenomenal Nature**: Anil Seth links the FEP to the genesis of conscious presence and the self in [[Consciousness & Philosophy of Mind]].

#fep #active-inference #neuroscience #cognition

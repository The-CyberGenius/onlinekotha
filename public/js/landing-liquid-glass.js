/**
 * OnlineKotha - Ultra-Premium Liquid Glass WebGL Engine
 * Powers realistic WebGL refraction, chromatic aberration, specular lighting,
 * and holographic glass badges on the landing page showcase.
 */

import { LiquidGlass } from './liquidglass/index.js';

(function () {
    // 1. Feature Detection
    function isWebGLAvailable() {
        try {
            const canvas = document.createElement('canvas');
            return !!(
                window.WebGLRenderingContext &&
                (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
            );
        } catch (e) {
            return false;
        }
    }

    // 2. Initialize LiquidGlass on Hero Memory Vault Showcase
    async function initVaultLiquidGlass() {
        const root = document.getElementById('vault-presentation-wrap');
        if (!root) return;

        const badges = root.querySelectorAll('.liquid-glass-badge');
        if (!badges.length) return;

        // If WebGL is not available, CSS backdrop-filter fallback is already active
        if (!isWebGLAvailable()) {
            console.info('[LiquidGlass] WebGL not available, utilizing ultra-refined CSS glass fallback.');
            return;
        }

        try {
            const instance = await LiquidGlass.init({
                root: root,
                glassElements: badges,
                defaults: {
                    blurAmount: 0.22,
                    refraction: 0.72,
                    chromAberration: 0.055,
                    specular: 0.58,
                    edgeHighlight: 0.20,
                    fresnel: 1.0,
                    cornerRadius: 22,
                    floating: true,
                    button: true,
                    shadowOpacity: 0.35,
                    shadowSpread: 12,
                    shadowOffsetY: 2
                }
            });

            window.__kothaLiquidGlass = instance;
            document.body.classList.add('liquid-glass-active');

            // 3. Performance Optimization: Pause rendering when out of viewport
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (!entry.isIntersecting) {
                                // Offscreen: stop unnecessary renders
                                if (instance._running) {
                                    instance._running = false;
                                    if (instance._rafId) cancelAnimationFrame(instance._rafId);
                                }
                            } else {
                                // Back on screen: resume
                                if (!instance._running) {
                                    instance._running = true;
                                    instance._globalDirty = true;
                                    instance._renderLoop();
                                }
                            }
                        });
                    },
                    { threshold: 0.1 }
                );
                observer.observe(root);
            }

            // 4. Interactive Turbo Pulse Synchronization
            const originalTurboPulse = window.triggerTurboPulse;
            window.triggerTurboPulse = function () {
                if (typeof originalTurboPulse === 'function') {
                    originalTurboPulse();
                }

                // Burst glass highlights & mark dirty
                badges.forEach((badge) => {
                    badge.classList.add('turbo-glass-burst');
                    if (instance.markChanged) {
                        instance.markChanged(badge);
                    }
                });

                setTimeout(() => {
                    badges.forEach((badge) => badge.classList.remove('turbo-glass-burst'));
                }, 1400);
            };

            // 5. Subtle ambient mouse parallax on badges (desktop only)
            if (window.matchMedia('(pointer: fine)').matches) {
                root.addEventListener('mousemove', (e) => {
                    const rect = root.getBoundingClientRect();
                    const relX = (e.clientX - rect.left) / rect.width - 0.5;
                    const relY = (e.clientY - rect.top) / rect.height - 0.5;

                    badges.forEach((b, idx) => {
                        // Only apply subtle shift if not currently being dragged by user
                        if (instance._drag && instance._drag.active && instance._drag.element === b) {
                            return;
                        }
                        const depth = (idx % 2 === 0 ? 1 : -1) * 8;
                        b.style.setProperty('--glass-parallax-x', `${relX * depth}px`);
                        b.style.setProperty('--glass-parallax-y', `${relY * depth}px`);
                    });
                }, { passive: true });
            }

        } catch (err) {
            console.warn('[LiquidGlass] WebGL initialization skipped, keeping CSS fallback:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVaultLiquidGlass);
    } else {
        initVaultLiquidGlass();
    }
})();

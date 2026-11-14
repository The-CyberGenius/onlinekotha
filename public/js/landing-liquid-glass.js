/**
 * OnlineKotha - Ultra-Premium Liquid Glass WebGL Engine
 * Dynamic Dark Glass vs Frosted Day Panel & Button Mode Engine
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

    function isDarkMode() {
        return document.documentElement.classList.contains('dark');
    }

    // 2. Specific Configurations (Frosted Panel, Dark Glass, Button Mode)
    function getPanelConfig(isDark) {
        if (isDark) {
            // Dark Glass (from user spec)
            return {
                brightness: -0.3,
                blurAmount: 0.25,
                cornerRadius: 50,
                button: true,
                floating: true,
                refraction: 0.70,
                specular: 0.55,
                edgeHighlight: 0.18,
                fresnel: 1.0,
                shadowOpacity: 0.40,
                shadowSpread: 14,
                shadowOffsetY: 2
            };
        } else {
            // Frosted Panel (from user spec)
            return {
                blurAmount: 0.25,
                cornerRadius: 30,
                button: true,
                floating: true,
                refraction: 0.70,
                specular: 0.55,
                edgeHighlight: 0.18,
                fresnel: 1.0,
                shadowOpacity: 0.25,
                shadowSpread: 10,
                shadowOffsetY: 2
            };
        }
    }

    function getButtonConfig(isDark) {
        // Button Mode (from user spec)
        // Set button: true to make a glass element react to hover and press:
        // hovering brightens it, pressing flattens the bevel and deepens the shadow.
        if (isDark) {
            return {
                button: true,
                cornerRadius: 24,
                brightness: -0.3,
                blurAmount: 0.25,
                refraction: 0.65,
                specular: 0.50,
                edgeHighlight: 0.16
            };
        } else {
            return {
                button: true,
                cornerRadius: 24,
                blurAmount: 0.25,
                refraction: 0.65,
                specular: 0.50,
                edgeHighlight: 0.16
            };
        }
    }

    function applyConfigs(isDark) {
        const panels = document.querySelectorAll('.liquid-glass-badge, .card.liquid-glass');
        const buttons = document.querySelectorAll('.liquid-glass-button, .liquid-glass-btn, .dock-btn');

        const panelCfg = JSON.stringify(getPanelConfig(isDark));
        panels.forEach((el) => {
            el.dataset.config = panelCfg;
        });

        const btnCfg = JSON.stringify(getButtonConfig(isDark));
        buttons.forEach((el) => {
            el.dataset.config = btnCfg;
        });

        if (window.__kothaLiquidGlass) {
            window.__kothaLiquidGlass._globalDirty = true;
        }
    }

    // 3. Global Theme Observer: Instantly applies Dark Glass vs Frosted Panel
    const themeObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'class') {
                const dark = isDarkMode();
                applyConfigs(dark);
            }
        }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // 4. Initialize LiquidGlass on Hero Showcase
    async function initVaultLiquidGlass() {
        const root = document.getElementById('vault-presentation-wrap');
        if (!root) return;

        const badges = root.querySelectorAll('.liquid-glass-badge');
        if (!badges.length) return;

        // Apply initial config based on active theme
        applyConfigs(isDarkMode());

        if (!isWebGLAvailable()) {
            console.info('[LiquidGlass] WebGL not available, utilizing ultra-refined CSS glass fallback.');
            return;
        }

        try {
            const initialDark = isDarkMode();
            const instance = await LiquidGlass.init({
                root: root,
                glassElements: badges,
                defaults: getPanelConfig(initialDark)
            });

            window.__kothaLiquidGlass = instance;
            document.body.classList.add('liquid-glass-active');

            // 5. Performance Optimization: Pause rendering when out of viewport
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver(
                    (entries) => {
                        entries.forEach((entry) => {
                            if (!entry.isIntersecting) {
                                if (instance._running) {
                                    instance._running = false;
                                    if (instance._rafId) cancelAnimationFrame(instance._rafId);
                                }
                            } else {
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

            // 6. Interactive Turbo Pulse Synchronization
            const originalTurboPulse = window.triggerTurboPulse;
            window.triggerTurboPulse = function () {
                if (typeof originalTurboPulse === 'function') {
                    originalTurboPulse();
                }

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

            // 7. Subtle ambient mouse parallax on badges (desktop only)
            if (window.matchMedia('(pointer: fine)').matches) {
                root.addEventListener('mousemove', (e) => {
                    const rect = root.getBoundingClientRect();
                    const relX = (e.clientX - rect.left) / rect.width - 0.5;
                    const relY = (e.clientY - rect.top) / rect.height - 0.5;

                    badges.forEach((b, idx) => {
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

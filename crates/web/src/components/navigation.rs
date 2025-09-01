use leptos::*;
use leptos_router::*;

#[component]
pub fn Navigation() -> impl IntoView {
    view! {
        <header class="border-b border-gray-200 bg-white">
            <nav class="max-w-6xl mx-auto px-8 py-4">
                <div class="flex items-center justify-between">
                    // Logo and title
                    <div class="flex items-center space-x-4">
                        <A href="/" class="font-mono text-2xl font-bold text-black hover:text-blue-600 transition-colors">
                            "POND"
                        </A>
                        <span class="font-serif text-gray-600">"Autonomous Robotics"</span>
                    </div>

                    // Main navigation
                    <div class="hidden md:flex items-center space-x-8 font-mono text-sm">
                        <A href="/introduction"
                           class="text-gray-700 hover:text-black transition-colors"
                           active_class="text-black font-medium">
                            "Introduction"
                        </A>
                        <A href="/guides"
                           class="text-gray-700 hover:text-black transition-colors"
                           active_class="text-black font-medium">
                            "Guides"
                        </A>
                        <A href="/reference"
                           class="text-gray-700 hover:text-black transition-colors"
                           active_class="text-black font-medium">
                            "Reference"
                        </A>

                        // External links
                        <a href="https://github.com/ecto/pond"
                           target="_blank"
                           class="text-gray-700 hover:text-black transition-colors">
                            "Code"
                        </a>
                        <a href="https://github.com/ecto/pond/discussions"
                           target="_blank"
                           class="text-gray-700 hover:text-black transition-colors">
                            "Community"
                        </a>
                    </div>

                    // Mobile menu button (placeholder)
                    <button class="md:hidden font-mono text-sm">
                        "Menu"
                    </button>
                </div>
            </nav>
        </header>
    }
}


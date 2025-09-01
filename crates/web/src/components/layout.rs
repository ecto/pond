use leptos::*;
use leptos_router::*;

use crate::components::navigation::Navigation;

#[component]
pub fn Layout() -> impl IntoView {
    view! {
        <div class="min-h-screen bg-white font-serif">
            <Navigation/>
            <div class="max-w-6xl mx-auto px-8 py-8">
                <div class="grid grid-cols-12 gap-6">
                    // Main content area
                    <main class="col-span-12 lg:col-span-9">
                        <Outlet/>
                    </main>

                    // Sidebar for table of contents or secondary navigation
                    <aside class="col-span-12 lg:col-span-3">
                        <div class="sticky top-8">
                            <nav class="font-mono text-sm">
                                <h3 class="font-bold mb-4 text-black">"Table of Contents"</h3>
                                // TOC will be populated dynamically
                            </nav>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    }
}


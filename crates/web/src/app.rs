use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::components::layout::Layout;
use crate::content::pages::*;

#[component]
pub fn App() -> impl IntoView {
    provide_meta_context();

    view! {
        <Stylesheet id="leptos" href="/pkg/pond-web.css"/>
        <Title text="Pond - Autonomous Robotics"/>
        <Meta name="description" content="Open-source blueprint for modular, thinking machines"/>

        <Router>
            <main>
                <Routes>
                    <Route path="" view=Layout>
                        <Route path="" view=HomePage/>
                        <Route path="/introduction" view=IntroductionPage/>
                        <Route path="/guides/:slug" view=GuidePage/>
                        <Route path="/reference/:slug" view=ReferencePage/>
                        <Route path="/reference/hardware/:slug" view=HardwarePage/>
                        <Route path="/reference/software/:slug" view=SoftwarePage/>
                        <Route path="/reference/firmware/:slug" view=FirmwarePage/>
                    </Route>
                </Routes>
            </main>
        </Router>
    }
}


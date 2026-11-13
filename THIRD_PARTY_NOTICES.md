# Third-Party Notices / 제3자 고지

EFL Sprite는 아래의 오픈소스 소프트웨어와 AI 모델을 사용합니다. 각 구성 요소는 해당 저작권자의 라이선스를 따르며,
이 문서는 그 라이선스가 요구하는 저작권 표시와 고지를 모은 것입니다.

EFL Sprite uses the open-source software and AI models listed below. Each component remains under its own
license; this file collects the copyright notices and license terms those licenses require.

- 앱 패키지에 **포함되는** 것: 1장(엔진)과 3장(라이브러리).
- 앱에 포함되지 **않고** 사용자가 앱에서 고르면 Hugging Face에서 직접 내려받는 것: 2장(AI 모델).
  모델 이용 조건은 각 원 저작자의 라이선스가 적용됩니다.

---

## 1. 앱에 포함된 엔진 / Bundled inference engines

| Component | License | Copyright | Source |
|---|---|---|---|
| llama.cpp (`llama-server` 및 ggml 라이브러리) | MIT | Copyright (c) 2023-2024 The ggml authors | https://github.com/ggml-org/llama.cpp |
| whisper.cpp (`whisper-cli` 및 ggml 라이브러리) | MIT | Copyright (c) 2023-2024 The ggml authors | https://github.com/ggml-org/whisper.cpp |
| ONNX Runtime (`onnxruntime` 라이브러리) | MIT | Copyright (c) Microsoft Corporation | https://github.com/microsoft/onnxruntime |

ONNX Runtime이 포함하는 제3자 구성 요소의 고지는
https://github.com/microsoft/onnxruntime/blob/main/ThirdPartyNotices.txt 를 따릅니다.

---

## 2. AI 모델 (앱에 미포함, 사용자가 직접 다운로드) / AI models (downloaded by the user, not bundled)

| Model | License | 상업적 이용 | Notes |
|---|---|---|---|
| Whisper base.en / small.en / medium.en (ggml 변환) | MIT, Copyright (c) 2022 OpenAI | 가능 | https://github.com/openai/whisper · 변환: https://huggingface.co/ggerganov/whisper.cpp |
| Qwen2.5-7B-Instruct, Qwen2.5-14B-Instruct (GGUF Q4_K_M) | Apache License 2.0, Copyright (c) Alibaba Cloud | 가능 | https://huggingface.co/Qwen · GGUF 양자화: https://huggingface.co/bartowski |
| **Qwen2.5-3B-Instruct** (GGUF Q4_K_M) | **Qwen RESEARCH LICENSE AGREEMENT** | **불가 — 비상업·연구·평가 목적 전용** | https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE · 상업적 이용 시 Alibaba Cloud에 별도 라이선스 요청 필요 |
| Gemma 3 4B IT (GGUF Q4_K_M) | Gemma Terms of Use | 조건부 가능 (금지 용도 정책 준수) | 아래 Gemma 고지 참조 · GGUF 양자화: https://huggingface.co/bartowski |
| GECToR RoBERTa-base 5k (ONNX) | MIT (모델 배포자 표기) | 주의 (아래 참조) | https://huggingface.co/letheviet/gector-roberta-base-5k-onnx · 원 구현: https://github.com/gotutiyan/gector · RoBERTa: https://github.com/facebookresearch/fairseq (MIT, Copyright (c) Facebook, Inc. and its affiliates) |

### Gemma

> Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms

Gemma 모델의 이용은 Gemma Terms of Use와 Gemma Prohibited Use Policy(https://ai.google.dev/gemma/prohibited_use_policy)의
이용 제한을 따릅니다. Use of Gemma is subject to the use restrictions in the Gemma Terms of Use and the
Gemma Prohibited Use Policy; users of this app must not use Gemma for any prohibited purpose.

### Qwen2.5-3B-Instruct

Qwen2.5-3B-Instruct는 Qwen RESEARCH LICENSE AGREEMENT에 따라 **비상업적 목적(연구·평가)으로만** 사용할 수 있습니다.
EFL Sprite의 기본·권장 모델은 Apache 2.0인 Qwen2.5-7B-Instruct이며, 3B는 저사양 PC용 선택 항목입니다.
Qwen2.5-3B-Instruct is licensed for non-commercial (research and evaluation) use only. Commercial users
must obtain a separate license from Alibaba Cloud or choose another model.

### GECToR 학습 데이터 / GECToR training data

GECToR 모델은 NUCLE, FCE, W&I+LOCNESS, Lang-8 등 학습자 영어 말뭉치로 학습되었습니다. 이 말뭉치들은 원 저작자가
**비상업적 목적으로만** 이용을 허락합니다(https://www.cl.cam.ac.uk/research/nl/bea2019st/). 모델 파일은 MIT로 배포되었지만,
비상업 데이터로 학습한 모델의 상업적 이용 가능 여부는 법적으로 확립되지 않았습니다.
The model weights are published under MIT, but the training corpora are licensed for non-commercial use only;
whether that restriction extends to the trained model is not settled.

### AI 출력 / AI output

AI 모델의 채점·교정·번역 결과는 오류가 있을 수 있으며, EFL Sprite가 제공하는 점수는 **AI 추정치**입니다.
TOEFL은 ETS의 등록 상표이며, 이 앱은 ETS가 보증하거나 승인하지 않았습니다.
TOEFL is a registered trademark of ETS. This product is not endorsed or approved by ETS.

---

## 3. 앱에 포함된 라이브러리 / Bundled libraries

### 3.1 화면 (npm, production dependencies)

| Package | Version | License | Source |
|---|---|---|---|
| react | 18.3.1 | MIT, Copyright (c) Meta Platforms, Inc. and affiliates | https://github.com/facebook/react |
| react-dom | 18.3.1 | MIT, Copyright (c) Meta Platforms, Inc. and affiliates | https://github.com/facebook/react |
| scheduler | 0.23.2 | MIT, Copyright (c) Meta Platforms, Inc. and affiliates | https://github.com/facebook/react |
| loose-envify | 1.4.0 | MIT, Copyright (c) 2015 Andres Suarez | https://github.com/zertosh/loose-envify |
| js-tokens | 4.0.0 | MIT, Copyright (c) 2014-2018 Simon Lydell | https://github.com/lydell/js-tokens |
| @tauri-apps/api | 2.12.4 | Apache-2.0 OR MIT, Copyright (c) 2017 - Present Tauri Apps Contributors | https://github.com/tauri-apps/tauri |
| @tauri-apps/plugin-dialog | 2.8.4 | MIT OR Apache-2.0, Copyright (c) 2017 - Present Tauri Apps Contributors | https://github.com/tauri-apps/plugins-workspace |

### 3.2 백엔드 (Rust crates)

앱 실행 파일에 링크되는 Rust 크레이트 전체 목록입니다(빌드 전용·개발 전용 의존성 제외, Windows·macOS 합산).
여러 라이선스 중 선택 가능한(`OR`) 크레이트는 그중 MIT 또는 Apache-2.0 조건으로 이용합니다.
MPL-2.0 크레이트(cssparser, cssparser-macros, dtoa-short, option-ext, selectors)는 수정 없이 사용하며,
소스 코드는 표의 저장소에서 받을 수 있습니다.

| Crate | Version | License | Repository |
|---|---|---|---|
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | https://github.com/oyvindln/adler2 |
| ahash | 0.8.12 | MIT OR Apache-2.0 | https://github.com/tkaitchuck/ahash |
| aho-corasick | 1.1.5 | Unlicense OR MIT | https://github.com/BurntSushi/aho-corasick |
| alloc-no-stdlib | 3.0.0 | BSD-3-Clause | https://github.com/dropbox/rust-alloc-no-stdlib |
| alloc-stdlib | 0.3.0 | BSD-3-Clause | https://github.com/dropbox/rust-alloc-no-stdlib |
| android_system_properties | 0.1.6 | MIT OR Apache-2.0 | https://github.com/nical/android_system_properties |
| anyhow | 1.0.104 | MIT OR Apache-2.0 | https://github.com/dtolnay/anyhow |
| atk | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| atk-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT | https://github.com/smol-rs/atomic-waker |
| base64 | 0.13.1 | MIT/Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| base64 | 0.21.7 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| base64 | 0.22.1 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| base64 | 0.23.1 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| bit-set | 0.8.0 | Apache-2.0 OR MIT | https://github.com/contain-rs/bit-set |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT | https://github.com/contain-rs/bit-vec |
| bitflags | 1.3.2 | MIT/Apache-2.0 | https://github.com/bitflags/bitflags |
| bitflags | 2.13.2 | MIT OR Apache-2.0 | https://github.com/bitflags/bitflags |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| block2 | 0.6.2 | MIT | https://github.com/madsmtm/objc2 |
| brotli | 9.1.1 | BSD-3-Clause AND MIT | https://github.com/dropbox/rust-brotli |
| brotli-decompressor | 6.2.0 | BSD-3-Clause/MIT | https://github.com/dropbox/rust-brotli-decompressor |
| bs58 | 0.5.1 | MIT/Apache-2.0 | https://github.com/Nullus157/bs58-rs |
| bumpalo | 3.20.3 | MIT OR Apache-2.0 | https://github.com/fitzgen/bumpalo |
| bytemuck | 1.25.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/Lokathor/bytemuck |
| byteorder | 1.5.0 | Unlicense OR MIT | https://github.com/BurntSushi/byteorder |
| bytes | 1.12.1 | MIT | https://github.com/tokio-rs/bytes |
| cairo-rs | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| cairo-sys-rs | 0.18.2 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| camino | 1.2.6 | MIT OR Apache-2.0 | https://github.com/camino-rs/camino |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 | https://github.com/rust-lang/cargo |
| cargo_metadata | 0.19.2 | MIT | https://github.com/oli-obk/cargo_metadata |
| castaway | 0.2.4 | MIT | https://github.com/sagebind/castaway |
| cesu8 | 1.1.0 | Apache-2.0/MIT | https://github.com/emk/cesu8-rs |
| cfb | 0.14.0 | MIT | https://github.com/mdsteele/rust-cfb |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/cfg-if |
| chacha20 | 0.10.2 | MIT OR Apache-2.0 | https://github.com/RustCrypto/stream-ciphers |
| chrono | 0.4.45 | MIT OR Apache-2.0 | https://github.com/chronotope/chrono |
| combine | 4.6.9 | MIT | https://github.com/Marwes/combine |
| compact_str | 0.9.1 | MIT | https://github.com/ParkMyCar/compact_str |
| cookie | 0.18.2 | MIT OR Apache-2.0 | https://github.com/SergioBenitez/cookie-rs |
| core-foundation | 0.10.1 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-foundation-sys | 0.8.7 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-graphics | 0.25.0 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| core-graphics-types | 0.2.0 | MIT OR Apache-2.0 | https://github.com/servo/core-foundation-rs |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| cpufeatures | 0.3.1 | MIT OR Apache-2.0 | https://github.com/RustCrypto/utils |
| crc32fast | 1.5.4 | MIT OR Apache-2.0 | https://github.com/srijs/rust-crc32fast |
| crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam |
| crossbeam-deque | 0.8.8 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam |
| crossbeam-epoch | 0.9.21 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam |
| crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 | https://github.com/crossbeam-rs/crossbeam |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| cssparser | 0.37.0 | MPL-2.0 | https://github.com/servo/rust-cssparser |
| cssparser-macros | 0.7.1 | MPL-2.0 | https://github.com/servo/rust-cssparser |
| ctor | 1.0.13 | Apache-2.0 OR MIT | https://github.com/mmastrac/linktime |
| darling | 0.20.11 | MIT | https://github.com/TedDriggs/darling |
| darling | 0.24.1 | MIT | https://github.com/TedDriggs/darling |
| darling_core | 0.20.11 | MIT | https://github.com/TedDriggs/darling |
| darling_core | 0.24.1 | MIT | https://github.com/TedDriggs/darling |
| darling_macro | 0.20.11 | MIT | https://github.com/TedDriggs/darling |
| darling_macro | 0.24.1 | MIT | https://github.com/TedDriggs/darling |
| dary_heap | 0.3.9 | MIT OR Apache-2.0 | https://github.com/hanmertens/dary_heap |
| dbus | 0.9.12 | Apache-2.0/MIT | https://github.com/diwic/dbus-rs |
| defmt | 1.2.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt |
| defmt-macros | 1.2.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt |
| defmt-parser | 1.1.0 | MIT OR Apache-2.0 | https://github.com/knurling-rs/defmt |
| deranged | 0.5.9 | MIT OR Apache-2.0 | https://github.com/jhpratt/deranged |
| derive_builder | 0.20.2 | MIT OR Apache-2.0 | https://github.com/colin-kiegel/rust-derive-builder |
| derive_builder_core | 0.20.2 | MIT OR Apache-2.0 | https://github.com/colin-kiegel/rust-derive-builder |
| derive_builder_macro | 0.20.2 | MIT OR Apache-2.0 | https://github.com/colin-kiegel/rust-derive-builder |
| derive_more | 2.1.1 | MIT | https://github.com/JelteF/derive_more |
| derive_more-impl | 2.1.1 | MIT | https://github.com/JelteF/derive_more |
| digest | 0.10.7 | MIT OR Apache-2.0 | https://github.com/RustCrypto/traits |
| dirs | 7.0.0 | MIT OR Apache-2.0 | https://codeberg.org/dirs/dirs-rs |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 | https://github.com/dirs-dev/dirs-sys-rs |
| dispatch2 | 0.3.1 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 | https://github.com/yaahc/displaydoc |
| dlopen2 | 0.8.2 | MIT | https://github.com/OpenByteDev/dlopen2 |
| dlopen2_derive | 0.4.3 | MIT | https://github.com/OpenByteDev/dlopen2 |
| dom_query | 0.28.0 | MIT | https://github.com/niklak/dom_query |
| dpi | 0.1.2 | Apache-2.0 AND MIT | https://github.com/rust-windowing/winit |
| dtoa | 1.0.11 | MIT OR Apache-2.0 | https://github.com/dtolnay/dtoa |
| dtoa-short | 0.3.5 | MPL-2.0 | https://github.com/upsuper/dtoa-short |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | https://gitlab.com/kornelski/dunce |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 | https://github.com/dtolnay/dyn-clone |
| either | 1.19.0 | MIT OR Apache-2.0 | https://github.com/rayon-rs/either |
| embed_plist | 1.2.2 | MIT OR Apache-2.0 | https://github.com/nvzqz/embed-plist-rs |
| equivalent | 1.0.3 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/equivalent |
| erased-serde | 0.4.11 | MIT OR Apache-2.0 | https://github.com/dtolnay/erased-serde |
| errno | 0.3.14 | MIT OR Apache-2.0 | https://github.com/lambda-fairy/rust-errno |
| esaxx-rs | 0.1.10 | Apache-2.0 | https://github.com/Narsil/esaxx-rs |
| fallible-iterator | 0.3.0 | MIT/Apache-2.0 | https://github.com/sfackler/rust-fallible-iterator |
| fallible-streaming-iterator | 0.1.9 | MIT/Apache-2.0 | https://github.com/sfackler/fallible-streaming-iterator |
| fancy-regex | 0.14.0 | MIT | https://github.com/fancy-regex/fancy-regex |
| fastrand | 2.5.0 | Apache-2.0 OR MIT | https://github.com/smol-rs/fastrand |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 | https://github.com/image-rs/fdeflate |
| field-offset | 0.3.6 | MIT OR Apache-2.0 | https://github.com/Diggsey/rust-field-offset |
| flate2 | 1.1.10 | MIT OR Apache-2.0 | https://github.com/rust-lang/flate2-rs |
| fnv | 1.0.7 | Apache-2.0 / MIT | https://github.com/servo/rust-fnv |
| foldhash | 0.2.0 | Zlib | https://github.com/orlp/foldhash |
| foreign-types | 0.5.0 | MIT/Apache-2.0 | https://github.com/sfackler/foreign-types |
| foreign-types-macros | 0.2.4 | MIT/Apache-2.0 | https://github.com/sfackler/foreign-types |
| foreign-types-shared | 0.3.1 | MIT/Apache-2.0 | https://github.com/sfackler/foreign-types |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url |
| futures-channel | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-core | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-executor | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-io | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-macro | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-sink | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-task | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| futures-util | 0.3.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/futures-rs |
| gdk | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdk-pixbuf | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gdk-pixbuf-sys | 0.18.0 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gdk-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdkwayland-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdkx11 | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gdkx11-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| generic-array | 0.14.7 | MIT | https://github.com/fizyk20/generic-array.git |
| getrandom | 0.2.17 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| getrandom | 0.3.4 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| gio | 0.18.4 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gio-sys | 0.18.1 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glib | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glib-macros | 0.18.5 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glib-sys | 0.18.1 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| glob | 0.3.4 | MIT OR Apache-2.0 | https://github.com/rust-lang/glob |
| gobject-sys | 0.18.0 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| gtk | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gtk-sys | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| gtk3-macros | 0.18.2 | MIT | https://github.com/gtk-rs/gtk3-rs |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashbrown | 0.14.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashlink | 0.9.1 | MIT OR Apache-2.0 | https://github.com/kyren/hashlink |
| heck | 0.4.1 | MIT OR Apache-2.0 | https://github.com/withoutboats/heck |
| heck | 0.5.0 | MIT OR Apache-2.0 | https://github.com/withoutboats/heck |
| hex | 0.4.3 | MIT OR Apache-2.0 | https://github.com/KokaKiwi/rust-hex |
| html5ever | 0.39.0 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| http | 1.5.0 | MIT OR Apache-2.0 | https://github.com/hyperium/http |
| http-body | 1.1.0 | MIT | https://github.com/hyperium/http-body |
| http-body-util | 0.1.5 | MIT | https://github.com/hyperium/http-body |
| httparse | 1.10.1 | MIT OR Apache-2.0 | https://github.com/seanmonstar/httparse |
| hyper | 1.12.0 | MIT | https://github.com/hyperium/hyper |
| hyper-rustls | 0.27.10 | Apache-2.0 OR ISC OR MIT | https://github.com/rustls/hyper-rustls |
| hyper-util | 0.1.21 | MIT | https://github.com/hyperium/hyper-util |
| iana-time-zone | 0.1.65 | MIT OR Apache-2.0 | https://github.com/strawlab/iana-time-zone |
| iana-time-zone-haiku | 0.1.2 | MIT OR Apache-2.0 | https://github.com/strawlab/iana-time-zone |
| ico | 0.6.0 | MIT | https://github.com/mdsteele/rust-ico |
| icu_collections | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_locale_core | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_normalizer | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_normalizer_data | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_properties | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_properties_data | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_provider | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| ident_case | 1.0.1 | MIT/Apache-2.0 | https://github.com/TedDriggs/ident_case |
| idna | 1.1.0 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT | https://github.com/hsivonen/idna_adapter |
| indexmap | 1.9.3 | Apache-2.0 OR MIT | https://github.com/bluss/indexmap |
| indexmap | 2.14.2 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/indexmap |
| infer | 0.22.0 | MIT | https://github.com/bojand/infer |
| ipnet | 2.12.2 | MIT OR Apache-2.0 | https://github.com/krisprice/ipnet |
| itertools | 0.14.0 | MIT OR Apache-2.0 | https://github.com/rust-itertools/itertools |
| itoa | 1.0.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/itoa |
| javascriptcore-rs | 1.1.2 | MIT | https://github.com/tauri-apps/javascriptcore-rs |
| javascriptcore-rs-sys | 1.1.1 | MIT | https://github.com/tauri-apps/javascriptcore-rs |
| jiff | 0.2.38 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-core | 0.1.1 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-static | 0.2.38 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-tzdb | 0.1.9 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT | https://github.com/BurntSushi/jiff |
| jni | 0.21.1 | MIT/Apache-2.0 | https://github.com/jni-rs/jni-rs |
| jni-sys | 0.3.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| js-sys | 0.3.107 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys |
| json-patch | 4.2.0 | MIT/Apache-2.0 | https://github.com/idubrov/json-patch |
| jsonptr | 0.7.1 | MIT OR Apache-2.0 | https://github.com/chanced/jsonptr |
| keyboard-types | 0.8.3 | MIT OR Apache-2.0 | https://github.com/rust-windowing/keyboard-types |
| libappindicator | 0.9.0 | Apache-2.0 OR MIT |  |
| libappindicator-sys | 0.9.0 | Apache-2.0 OR MIT |  |
| libc | 0.2.191 | MIT OR Apache-2.0 | https://github.com/rust-lang/libc |
| libdbus-sys | 0.2.7 | Apache-2.0/MIT | https://github.com/diwic/dbus-rs |
| libloading | 0.7.4 | ISC | https://github.com/nagisa/rust_libloading/ |
| libloading | 0.9.0 | ISC | https://github.com/nagisa/rust_libloading/ |
| libredox | 0.1.25 | MIT | https://gitlab.redox-os.org/redox-os/libredox.git |
| libsqlite3-sys | 0.30.1 | MIT | https://github.com/rusqlite/rusqlite |
| litemap | 0.8.3 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| lock_api | 0.4.14 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot |
| log | 0.4.35 | MIT OR Apache-2.0 | https://github.com/rust-lang/log |
| lru-slab | 0.1.3 | MIT OR Apache-2.0 OR Zlib | https://github.com/Ralith/lru-slab |
| macro_rules_attribute | 0.2.3 | Apache-2.0 OR MIT OR Zlib | https://github.com/danielhenrymantilla/macro_rules_attribute-rs |
| macro_rules_attribute-proc_macro | 0.2.3 | Apache-2.0 OR MIT OR Zlib | https://github.com/danielhenrymantilla/macro_rules_attribute-rs |
| markup5ever | 0.39.0 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| matrixmultiply | 0.3.11 | MIT/Apache-2.0 | https://github.com/bluss/matrixmultiply/ |
| memchr | 2.8.3 | Unlicense OR MIT | https://github.com/BurntSushi/memchr |
| memoffset | 0.9.1 | MIT | https://github.com/Gilnaa/memoffset |
| mime | 0.3.17 | MIT OR Apache-2.0 | https://github.com/hyperium/mime |
| minimal-lexical | 0.2.1 | MIT/Apache-2.0 | https://github.com/Alexhuszagh/minimal-lexical |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide |
| miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 | https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide |
| mio | 1.2.4 | MIT | https://github.com/tokio-rs/mio |
| monostate | 0.1.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/monostate |
| monostate-impl | 0.1.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/monostate |
| muda | 0.20.0 | Apache-2.0 OR MIT | https://github.com/tauri-apps/muda |
| ndarray | 0.17.2 | MIT OR Apache-2.0 | https://github.com/rust-ndarray/ndarray |
| ndk | 0.9.0 | MIT OR Apache-2.0 | https://github.com/rust-mobile/ndk |
| ndk-context | 0.1.1 | MIT OR Apache-2.0 | https://github.com/rust-windowing/android-ndk-rs |
| ndk-sys | 0.6.0+11769913 | MIT OR Apache-2.0 | https://github.com/rust-mobile/ndk |
| new_debug_unreachable | 1.0.6 | MIT | https://github.com/mbrubeck/rust-debug-unreachable |
| nom | 7.1.3 | MIT | https://github.com/Geal/nom |
| num-complex | 0.4.6 | MIT OR Apache-2.0 | https://github.com/rust-num/num-complex |
| num-conv | 0.2.2 | MIT OR Apache-2.0 | https://github.com/jhpratt/num-conv |
| num-integer | 0.1.47 | MIT OR Apache-2.0 | https://github.com/rust-num/num-integer |
| num-traits | 0.2.19 | MIT OR Apache-2.0 | https://github.com/rust-num/num-traits |
| num_enum | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | https://github.com/illicitonion/num_enum |
| num_enum_derive | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | https://github.com/illicitonion/num_enum |
| objc2 | 0.6.5 | MIT | https://github.com/madsmtm/objc2 |
| objc2-app-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-cloud-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-data | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-foundation | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-graphics | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-image | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-location | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-core-text | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-encode | 4.1.0 | MIT | https://github.com/madsmtm/objc2 |
| objc2-exception-helper | 0.1.1 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-foundation | 0.3.2 | MIT | https://github.com/madsmtm/objc2 |
| objc2-io-surface | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-quartz-core | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-ui-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-user-notifications | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| objc2-web-kit | 0.3.2 | Zlib OR Apache-2.0 OR MIT | https://github.com/madsmtm/objc2 |
| once_cell | 1.21.4 | MIT OR Apache-2.0 | https://github.com/matklad/once_cell |
| option-ext | 0.2.0 | MPL-2.0 | https://github.com/soc/option-ext.git |
| ort | 2.0.0-rc.15 | MIT OR Apache-2.0 | https://github.com/pykeio/ort |
| ort-sys | 2.0.0-rc.15 | MIT OR Apache-2.0 | https://github.com/pykeio/ort |
| pango | 0.18.3 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| pango-sys | 0.18.0 | MIT | https://github.com/gtk-rs/gtk-rs-core |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 | https://github.com/Amanieu/parking_lot |
| paste | 1.0.15 | MIT OR Apache-2.0 | https://github.com/dtolnay/paste |
| pastey | 0.2.3 | MIT OR Apache-2.0 | https://github.com/as1100k/pastey |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ |
| phf | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| phf_generator | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| phf_macros | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| phf_shared | 0.13.1 | MIT | https://github.com/rust-phf/rust-phf |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT | https://github.com/taiki-e/pin-project-lite |
| plist | 1.10.3 | MIT | https://github.com/ebarnard/rust-plist/ |
| png | 0.18.1 | MIT OR Apache-2.0 | https://github.com/image-rs/image-png |
| portable-atomic | 1.15.0 | Apache-2.0 OR MIT | https://github.com/taiki-e/portable-atomic |
| portable-atomic-util | 0.2.8 | Apache-2.0 OR MIT | https://github.com/taiki-e/portable-atomic-util |
| potential_utf | 0.1.6 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| powerfmt | 0.2.1 | MIT OR Apache-2.0 | https://github.com/jhpratt/powerfmt |
| ppv-lite86 | 0.2.21 | MIT OR Apache-2.0 | https://github.com/cryptocorrosion/cryptocorrosion |
| precomputed-hash | 0.1.1 | MIT | https://github.com/emilio/precomputed-hash |
| proc-macro-crate | 1.3.1 | MIT OR Apache-2.0 | https://github.com/bkchr/proc-macro-crate |
| proc-macro-crate | 2.0.2 | MIT OR Apache-2.0 | https://github.com/bkchr/proc-macro-crate |
| proc-macro-crate | 3.5.0 | MIT OR Apache-2.0 | https://github.com/bkchr/proc-macro-crate |
| proc-macro-error | 1.0.4 | MIT OR Apache-2.0 | https://gitlab.com/CreepySkeleton/proc-macro-error |
| proc-macro-error-attr | 1.0.4 | MIT OR Apache-2.0 | https://gitlab.com/CreepySkeleton/proc-macro-error |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | https://github.com/dtolnay/proc-macro2 |
| quick-xml | 0.42.0 | MIT | https://github.com/tafia/quick-xml |
| quinn | 0.11.12 | MIT OR Apache-2.0 | https://github.com/quinn-rs/quinn |
| quinn-proto | 0.11.19 | MIT OR Apache-2.0 | https://github.com/quinn-rs/quinn |
| quinn-udp | 0.5.16 | MIT OR Apache-2.0 | https://github.com/quinn-rs/quinn |
| quote | 1.0.47 | MIT OR Apache-2.0 | https://github.com/dtolnay/quote |
| r-efi | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | https://github.com/r-efi/r-efi |
| r-efi | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | https://github.com/r-efi/r-efi |
| rand | 0.10.3 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| rand | 0.9.5 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| rand_chacha | 0.9.0 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| rand_core | 0.10.1 | MIT OR Apache-2.0 | https://github.com/rust-random/rand_core |
| rand_core | 0.9.5 | MIT OR Apache-2.0 | https://github.com/rust-random/rand |
| rand_pcg | 0.10.2 | MIT OR Apache-2.0 | https://github.com/rust-random/rngs |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib | https://github.com/rust-windowing/raw-window-handle |
| rawpointer | 0.2.1 | MIT/Apache-2.0 | https://github.com/bluss/rawpointer/ |
| rayon | 1.12.0 | MIT OR Apache-2.0 | https://github.com/rayon-rs/rayon |
| rayon-cond | 0.4.0 | Apache-2.0/MIT | https://github.com/cuviper/rayon-cond |
| rayon-core | 1.13.0 | MIT OR Apache-2.0 | https://github.com/rayon-rs/rayon |
| redox_syscall | 0.5.18 | MIT | https://gitlab.redox-os.org/redox-os/syscall |
| redox_users | 0.5.3 | MIT | https://gitlab.redox-os.org/redox-os/users |
| ref-cast | 1.0.27 | MIT OR Apache-2.0 | https://github.com/dtolnay/ref-cast |
| ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 | https://github.com/dtolnay/ref-cast |
| regex | 1.13.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 | https://github.com/rust-lang/regex |
| reqwest | 0.12.28 | MIT OR Apache-2.0 | https://github.com/seanmonstar/reqwest |
| reqwest | 0.13.5 | MIT OR Apache-2.0 | https://github.com/seanmonstar/reqwest |
| rfd | 0.17.2 | MIT | https://github.com/PolyMeilex/rfd |
| ring | 0.17.14 | Apache-2.0 AND ISC | https://github.com/briansmith/ring |
| rusqlite | 0.32.1 | MIT | https://github.com/rusqlite/rusqlite |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT | https://github.com/rust-lang/rustc-hash |
| rustls | 0.23.46 | Apache-2.0 OR ISC OR MIT | https://github.com/rustls/rustls |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 | https://github.com/rustls/pki-types |
| rustls-webpki | 0.103.16 | ISC | https://github.com/rustls/webpki |
| rustversion | 1.0.23 | MIT OR Apache-2.0 | https://github.com/dtolnay/rustversion |
| ryu | 1.0.23 | Apache-2.0 OR BSL-1.0 | https://github.com/dtolnay/ryu |
| same-file | 1.0.6 | Unlicense/MIT | https://github.com/BurntSushi/same-file |
| schemars | 0.8.22 | MIT | https://github.com/GREsau/schemars |
| schemars | 0.9.0 | MIT | https://github.com/GREsau/schemars |
| schemars | 1.2.3 | MIT | https://github.com/GREsau/schemars |
| schemars_derive | 0.8.22 | MIT | https://github.com/GREsau/schemars |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 | https://github.com/bluss/scopeguard |
| selectors | 0.38.0 | MPL-2.0 | https://github.com/servo/stylo |
| semver | 1.0.28 | MIT OR Apache-2.0 | https://github.com/dtolnay/semver |
| serde | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 | https://github.com/dtolnay/serde-untagged |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_json | 1.0.154 | MIT OR Apache-2.0 | https://github.com/serde-rs/json |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/serde-repr |
| serde_spanned | 0.6.9 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| serde_spanned | 1.1.2 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| serde_urlencoded | 0.7.1 | MIT/Apache-2.0 | https://github.com/nox/serde_urlencoded |
| serde_with | 3.24.0 | MIT OR Apache-2.0 | https://github.com/jonasbb/serde_with/ |
| serde_with_macros | 3.24.0 | MIT OR Apache-2.0 | https://github.com/jonasbb/serde_with/ |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 | https://github.com/chippers/serialize-to-javascript |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 | https://github.com/chippers/serialize-to-javascript |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 | https://github.com/servo/stylo |
| sha2 | 0.10.9 | MIT OR Apache-2.0 | https://github.com/RustCrypto/hashes |
| signal-hook-registry | 1.4.8 | MIT OR Apache-2.0 | https://github.com/vorner/signal-hook |
| simd-adler32 | 0.3.10 | MIT | https://github.com/mcountryman/simd-adler32 |
| siphasher | 1.0.4 | MIT OR Apache-2.0 | https://github.com/jedisct1/rust-siphash |
| slab | 0.4.12 | MIT | https://github.com/tokio-rs/slab |
| smallvec | 1.16.4 | MIT OR Apache-2.0 | https://github.com/servo/rust-smallvec |
| socket2 | 0.6.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/socket2 |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 | https://github.com/rust-windowing/softbuffer |
| soup3 | 0.5.0 | MIT | https://gitlab.gnome.org/World/Rust/soup3-rs |
| soup3-sys | 0.5.0 | MIT | https://gitlab.gnome.org/World/Rust/soup3-rs |
| spm_precompiled | 0.1.4 | Apache-2.0 | https://github.com/huggingface/spm_precompiled |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | https://github.com/storyyeller/stable_deref_trait |
| static_assertions | 1.1.0 | MIT OR Apache-2.0 | https://github.com/nvzqz/static-assertions-rs |
| string_cache | 0.9.0 | MIT OR Apache-2.0 | https://github.com/servo/string-cache |
| strsim | 0.11.1 | MIT | https://github.com/rapidfuzz/strsim-rs |
| subtle | 2.6.1 | BSD-3-Clause | https://github.com/dalek-cryptography/subtle |
| swift-rs | 1.0.9 | MIT OR Apache-2.0 | https://github.com/Brendonovich/swift-rs |
| syn | 1.0.109 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| syn | 2.0.119 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| syn | 3.0.9 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| sync_wrapper | 1.0.2 | Apache-2.0 | https://github.com/Actyx/sync_wrapper |
| synstructure | 0.14.0 | MIT | https://github.com/mystor/synstructure |
| tao | 0.37.2 | Apache-2.0 | https://github.com/tauri-apps/tao |
| tao-macros | 0.1.4 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tao |
| tauri | 2.12.5 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-codegen | 2.7.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-macros | 2.7.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-plugin-dialog | 2.8.4 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-plugin-fs | 2.7.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/plugins-workspace |
| tauri-runtime | 2.12.2 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-runtime-wry | 2.12.3 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tauri-utils | 2.10.2 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| tendril | 0.5.1 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| thiserror | 1.0.69 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror | 2.0.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror-impl | 1.0.69 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| time | 0.3.55 | MIT OR Apache-2.0 | https://github.com/time-rs/time |
| time-core | 0.1.9 | MIT OR Apache-2.0 | https://github.com/time-rs/time |
| time-macros | 0.2.32 | MIT OR Apache-2.0 | https://github.com/time-rs/time |
| tinystr | 0.8.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT | https://github.com/Lokathor/tinyvec |
| tokenizers | 0.22.2 | Apache-2.0 | https://github.com/huggingface/tokenizers |
| tokio | 1.54.1 | MIT | https://github.com/tokio-rs/tokio |
| tokio-rustls | 0.26.6 | MIT OR Apache-2.0 | https://github.com/rustls/tokio-rustls |
| tokio-util | 0.7.20 | MIT | https://github.com/tokio-rs/tokio |
| toml | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_datetime | 0.6.3 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_datetime | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_edit | 0.19.15 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_edit | 0.20.2 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_edit | 0.25.17+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_parser | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| toml_writer | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | https://github.com/toml-rs/toml |
| tower | 0.5.3 | MIT | https://github.com/tower-rs/tower |
| tower-http | 0.6.11 | MIT | https://github.com/tower-rs/tower-http |
| tower-layer | 0.3.3 | MIT | https://github.com/tower-rs/tower |
| tower-service | 0.3.3 | MIT | https://github.com/tower-rs/tower |
| tracing | 0.1.44 | MIT | https://github.com/tokio-rs/tracing |
| tracing-core | 0.1.36 | MIT | https://github.com/tokio-rs/tracing |
| tray-icon | 0.25.1 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tray-icon |
| try-lock | 0.2.5 | MIT | https://github.com/seanmonstar/try-lock |
| typeid | 1.0.3 | MIT OR Apache-2.0 | https://github.com/dtolnay/typeid |
| typenum | 1.20.1 | MIT OR Apache-2.0 | https://github.com/paholg/typenum |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | https://github.com/dtolnay/unicode-ident |
| unicode-normalization-alignments | 0.1.12 | MIT/Apache-2.0 | https://github.com/n1t0/unicode-normalization |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 | https://github.com/unicode-rs/unicode-segmentation |
| unicode_categories | 0.1.1 | MIT OR Apache-2.0 | https://github.com/swgillespie/unicode-categories |
| untrusted | 0.9.0 | ISC | https://github.com/briansmith/untrusted |
| url | 2.5.8 | MIT OR Apache-2.0 | https://github.com/servo/rust-url |
| urlpattern | 0.6.0 | MIT | https://github.com/denoland/rust-urlpattern |
| utf8_iter | 1.1.0 | Apache-2.0 OR MIT | https://github.com/hsivonen/utf8_iter |
| utf_types | 1.0.0 | Apache-2.0 OR MIT | https://github.com/hsivonen/utf_types |
| uuid | 1.29.0 | Apache-2.0 OR MIT | https://github.com/uuid-rs/uuid |
| walkdir | 2.5.0 | Unlicense/MIT | https://github.com/BurntSushi/walkdir |
| want | 0.3.2 | MIT | https://github.com/seanmonstar/want |
| wasi | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wasi |
| wasip2 | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wasi-rs |
| wasm-bindgen | 0.2.130 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen |
| wasm-bindgen-futures | 0.4.80 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures |
| wasm-bindgen-macro | 0.2.130 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro |
| wasm-bindgen-macro-support | 0.2.130 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/main/crates/macro-support |
| wasm-bindgen-shared | 0.2.130 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared |
| wasm-streams | 0.4.2 | MIT OR Apache-2.0 | https://github.com/MattiasBuelens/wasm-streams/ |
| wasm-streams | 0.5.0 | MIT OR Apache-2.0 | https://github.com/MattiasBuelens/wasm-streams/ |
| web-sys | 0.3.107 | MIT OR Apache-2.0 | https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys |
| web-time | 1.1.0 | MIT OR Apache-2.0 | https://github.com/daxpedda/web-time |
| web_atoms | 0.2.6 | MIT OR Apache-2.0 | https://github.com/servo/html5ever |
| webkit2gtk | 2.0.2 | MIT | https://github.com/tauri-apps/webkit2gtk-rs |
| webkit2gtk-sys | 2.0.2 | MIT | https://github.com/tauri-apps/webkit2gtk-rs |
| webpki-roots | 1.0.11 | CDLA-Permissive-2.0 | https://github.com/rustls/webpki-roots |
| webview2-com | 0.39.1 | MIT | https://github.com/wravery/webview2-rs |
| webview2-com-macros | 0.8.1 | MIT | https://github.com/wravery/webview2-rs |
| webview2-com-sys | 0.39.1 | MIT | https://github.com/wravery/webview2-rs |
| winapi | 0.3.9 | MIT/Apache-2.0 | https://github.com/retep998/winapi-rs |
| winapi-i686-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | https://github.com/retep998/winapi-rs |
| winapi-util | 0.1.11 | Unlicense OR MIT | https://github.com/BurntSushi/winapi-util |
| winapi-x86_64-pc-windows-gnu | 0.4.0 | MIT/Apache-2.0 | https://github.com/retep998/winapi-rs |
| window-vibrancy | 0.8.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri-plugin-vibrancy |
| windows | 0.62.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-collections | 0.3.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-core | 0.62.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-future | 0.3.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-link | 0.2.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-numerics | 0.3.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-result | 0.4.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.45.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.52.0 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-targets | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-threading | 0.2.1 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows-version | 0.1.7 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_msvc | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_aarch64_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnu | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnu | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_gnullvm | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_msvc | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_i686_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnu | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnu | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnullvm | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_gnullvm | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_msvc | 0.42.2 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| winnow | 0.5.40 | MIT | https://github.com/winnow-rs/winnow |
| winnow | 1.0.4 | MIT | https://github.com/winnow-rs/winnow |
| wit-bindgen | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wit-bindgen |
| writeable | 0.6.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| wry | 0.57.1 | Apache-2.0 OR MIT | https://github.com/tauri-apps/wry |
| x11 | 2.21.0 | MIT | https://github.com/AltF02/x11-rs.git |
| x11-dl | 2.21.0 | MIT | https://github.com/AltF02/x11-rs.git |
| yoke | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| yoke-derive | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerocopy | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT | https://github.com/google/zerocopy |
| zerocopy-derive | 0.8.63 | BSD-2-Clause OR Apache-2.0 OR MIT | https://github.com/google/zerocopy |
| zerofrom | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerofrom-derive | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zeroize | 1.9.1 | Apache-2.0 OR MIT | https://github.com/RustCrypto/utils |
| zerotrie | 0.2.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerovec | 0.11.9 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerovec-derive | 0.11.7 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zlib-rs | 0.6.8 | Zlib | https://github.com/trifectatechfoundation/zlib-rs |
| zmij | 1.0.23 | MIT | https://github.com/dtolnay/zmij |

---

## 4. 라이선스 전문 / License texts

### MIT License

위 표에서 MIT로 표시된 구성 요소에 적용됩니다. 저작권 표시는 각 표의 Copyright 열과 원 저장소를 따릅니다.

```
Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache License 2.0

```
Apache License
                        Version 2.0, January 2004
                     http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

   "License" shall mean the terms and conditions for use, reproduction,
   and distribution as defined by Sections 1 through 9 of this document.

   "Licensor" shall mean the copyright owner or entity authorized by
   the copyright owner that is granting the License.

   "Legal Entity" shall mean the union of the acting entity and all
   other entities that control, are controlled by, or are under common
   control with that entity. For the purposes of this definition,
   "control" means (i) the power, direct or indirect, to cause the
   direction or management of such entity, whether by contract or
   otherwise, or (ii) ownership of fifty percent (50%) or more of the
   outstanding shares, or (iii) beneficial ownership of such entity.

   "You" (or "Your") shall mean an individual or Legal Entity
   exercising permissions granted by this License.

   "Source" form shall mean the preferred form for making modifications,
   including but not limited to software source code, documentation
   source, and configuration files.

   "Object" form shall mean any form resulting from mechanical
   transformation or translation of a Source form, including but
   not limited to compiled object code, generated documentation,
   and conversions to other media types.

   "Work" shall mean the work of authorship, whether in Source or
   Object form, made available under the License, as indicated by a
   copyright notice that is included in or attached to the work
   (an example is provided in the Appendix below).

   "Derivative Works" shall mean any work, whether in Source or Object
   form, that is based on (or derived from) the Work and for which the
   editorial revisions, annotations, elaborations, or other modifications
   represent, as a whole, an original work of authorship. For the purposes
   of this License, Derivative Works shall not include works that remain
   separable from, or merely link (or bind by name) to the interfaces of,
   the Work and Derivative Works thereof.

   "Contribution" shall mean any work of authorship, including
   the original version of the Work and any modifications or additions
   to that Work or Derivative Works thereof, that is intentionally
   submitted to Licensor for inclusion in the Work by the copyright owner
   or by an individual or Legal Entity authorized to submit on behalf of
   the copyright owner. For the purposes of this definition, "submitted"
   means any form of electronic, verbal, or written communication sent
   to the Licensor or its representatives, including but not limited to
   communication on electronic mailing lists, source code control systems,
   and issue tracking systems that are managed by, or on behalf of, the
   Licensor for the purpose of discussing and improving the Work, but
   excluding communication that is conspicuously marked or otherwise
   designated in writing by the copyright owner as "Not a Contribution."

   "Contributor" shall mean Licensor and any individual or Legal Entity
   on behalf of whom a Contribution has been received by Licensor and
   subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   copyright license to reproduce, prepare Derivative Works of,
   publicly display, publicly perform, sublicense, and distribute the
   Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of
   this License, each Contributor hereby grants to You a perpetual,
   worldwide, non-exclusive, no-charge, royalty-free, irrevocable
   (except as stated in this section) patent license to make, have made,
   use, offer to sell, sell, import, and otherwise transfer the Work,
   where such license applies only to those patent claims licensable
   by such Contributor that are necessarily infringed by their
   Contribution(s) alone or by combination of their Contribution(s)
   with the Work to which such Contribution(s) was submitted. If You
   institute patent litigation against any entity (including a
   cross-claim or counterclaim in a lawsuit) alleging that the Work
   or a Contribution incorporated within the Work constitutes direct
   or contributory patent infringement, then any patent licenses
   granted to You under this License for that Work shall terminate
   as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the
   Work or Derivative Works thereof in any medium, with or without
   modifications, and in Source or Object form, provided that You
   meet the following conditions:

   (a) You must give any other recipients of the Work or
       Derivative Works a copy of this License; and

   (b) You must cause any modified files to carry prominent notices
       stating that You changed the files; and

   (c) You must retain, in the Source form of any Derivative Works
       that You distribute, all copyright, patent, trademark, and
       attribution notices from the Source form of the Work,
       excluding those notices that do not pertain to any part of
       the Derivative Works; and

   (d) If the Work includes a "NOTICE" text file as part of its
       distribution, then any Derivative Works that You distribute must
       include a readable copy of the attribution notices contained
       within such NOTICE file, excluding those notices that do not
       pertain to any part of the Derivative Works, in at least one
       of the following places: within a NOTICE text file distributed
       as part of the Derivative Works; within the Source form or
       documentation, if provided along with the Derivative Works; or,
       within a display generated by the Derivative Works, if and
       wherever such third-party notices normally appear. The contents
       of the NOTICE file are for informational purposes only and
       do not modify the License. You may add Your own attribution
       notices within Derivative Works that You distribute, alongside
       or as an addendum to the NOTICE text from the Work, provided
       that such additional attribution notices cannot be construed
       as modifying the License.

   You may add Your own copyright statement to Your modifications and
   may provide additional or different license terms and conditions
   for use, reproduction, or distribution of Your modifications, or
   for any such Derivative Works as a whole, provided Your use,
   reproduction, and distribution of the Work otherwise complies with
   the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade
   names, trademarks, service marks, or product names of the Licensor,
   except as required for reasonable and customary use in describing the
   origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or
   agreed to in writing, Licensor provides the Work (and each
   Contributor provides its Contributions) on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
   implied, including, without limitation, any warranties or conditions
   of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
   PARTICULAR PURPOSE. You are solely responsible for determining the
   appropriateness of using or redistributing the Work and assume any
   risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory,
   whether in tort (including negligence), contract, or otherwise,
   unless required by applicable law (such as deliberate and grossly
   negligent acts) or agreed to in writing, shall any Contributor be
   liable to You for damages, including any direct, indirect, special,
   incidental, or consequential damages of any character arising as a
   result of this License or out of the use or inability to use the
   Work (including but not limited to damages for loss of goodwill,
   work stoppage, computer failure or malfunction, or any and all
   other commercial damages or losses), even if such Contributor
   has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing
   the Work or Derivative Works thereof, You may choose to offer,
   and charge a fee for, acceptance of support, warranty, indemnity,
   or other liability obligations and/or rights consistent with this
   License. However, in accepting such obligations, You may act only
   on Your own behalf and on Your sole responsibility, not on behalf
   of any other Contributor, and only if You agree to indemnify,
   defend, and hold each Contributor harmless for any liability
   incurred by, or claims asserted against, such Contributor by reason
   of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
```

### 기타 / Others

- Mozilla Public License 2.0: https://www.mozilla.org/MPL/2.0/
- Unicode License v3: https://www.unicode.org/license.txt
- Community Data License Agreement – Permissive 2.0: https://cdla.dev/permissive-2-0/
- BSD-2-Clause / BSD-3-Clause / ISC / Zlib / 0BSD / BSL-1.0: https://spdx.org/licenses/
- Qwen RESEARCH LICENSE AGREEMENT: https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/blob/main/LICENSE
- Gemma Terms of Use: https://ai.google.dev/gemma/terms

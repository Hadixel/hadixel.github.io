# Iranian kitchen manufacturer marquee — evidence

The homepage marquee uses the manufacturer list in `iranian-manufacturers.ts`. It is a curated catalogue, not a claim that خانه مدرن carries every listed manufacturer.

Checked against public manufacturer sites and Iranian retail/industry references on 2026-09-25:

- کن — https://can.ir/about/
- استیل البرز — https://steelalborz.com/
- بیمکث — https://bimax.ir/product-category/sink/steel-sink/ and https://www.ertana.ir/content/article/1155/
- ایلیا استیل — https://eghtesadjournal.com/industry-mining-trade/232984/
- پیکو — https://peiko.ir/
- تاکنو — https://tacno.ir/
- روبینا — https://www.akpsho.com/shopview/6569/
- اخوان، داتیس، آلتون، استیل البرز، کن، ایلیا استیل، بیمکث — https://feriran.com/iranian-kitchen-hood/ and https://citysazeh.com/what-is-the-best-iranian-sink-brand/
- هود: میلان گاز، درسا، امرسان، بنس، جهان گاز — https://www.namayeshgahha.ir/lists-of-10/kitchen-hood-manufacturers/
- هود: آرویک، جهان گاز، میلان گاز، اخوان، بیمکث، کن، استیل البرز، داتیس — https://www.arvik.co/best-iranian-hood-brands/
- هود/سینک/فر/اجاق: آلتون، بیمکث، داتیس، ایلیا استیل، کن، اخوان — https://novinhome.com/بهترین-هود-آشپزخانه/
- فر: سینجر، رابیتس، سانترا، ایلیا استیل — https://barandak.ir/built-in-oven-manufacturers/
- فر/اجاق: تولیپس، ساتین، سینجر — https://charsoo.com/blog/بهترین-مارک-فر/ and https://charsoo.com/blog/بهترین-اجاق-گاز-ایرانی/
- اجاق گاز: نیک کالا، اخوان، استیل البرز، کن، بیمکث، سینجر، میلان، آلتون، ایلیا استیل — https://divar.news/the-best-brands-of-oven-in-iran/
- سینک: فرامکو، اخوان، استیل البرز، ایلیا استیل، کن، آلتون، داتیس، بیمکث — https://citysazeh.com/what-is-the-best-iranian-sink-brand/

## Excluded during review

- هاردستون — origin is contested in the available sources; treated as a supplied brand rather than a verified independent Iranian manufacturer.
- گوفر — house brand of صنایع امرسان, which is already represented in the list.
- مسترپلاس — trade name of گروه صنعتی ناب استیل, not an independent manufacturer name.
- The earlier unverified names (بیم، وایکو، سپهر و بین، پرن و پارس، هاردست، مروارید، تیمور، یوکن، سارنگ، ساریا، سوزان، آرین، رویا، آما) were removed because no reliable manufacturer evidence was found.

## Marquee logo assets

Vendors' own artwork, pulled from their official sites into
`apps/store/public/brands/` and rendered as the whole item — the strip shows
the logo alone, with the brand name kept as the image's accessible name. Items
without an `image` still render name-only.

| Brand       | File               | Source                                                                                                                                                                                                                               |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| کن          | `kan.png`          | https://can.ir/wp-content/uploads/2025/11/logo-can-final-copy.png                                                                                                                                                                    |
| اخوان       | `akhavan.png`      | https://akhavan.ir/asset/img/lf.png                                                                                                                                                                                                  |
| بیمکث       | `bimax.svg`        | https://bimax.ir/wp-content/themes/codarx/assets/images/logo.svg — dark artwork, rendered with `imageInvert`; the site ships no light variant                                                                                        |
| استیل البرز | `steel-alborz.png` | https://steelalborz.com/wp-content/uploads/2020/03/logo-2-white.png (the site's white variant)                                                                                                                                       |
| داتیس       | `datees-color.png` | coloured wordmark from Datees' own LinkedIn company page (`datees_logo` asset, 200×200 JPEG on white); white background keyed to alpha and trimmed to the artwork. datees.ir itself only publishes the monochrome white `/logo.webp` |
| آلتون       | `alton.webp`       | https://alton-home.com/wp-content/uploads/2026/06/logo-alton-300x98-1.png.webp                                                                                                                                                       |
| ایلیا استیل | `ilia-steel.webp`  | https://iliasteel.ir/wp-content/uploads/2025/02/Logo-1.webp                                                                                                                                                                          |
| پیکو        | `peiko.png`        | https://peiko.ir/wp-content/uploads/2024/08/peiko-english.png                                                                                                                                                                        |
| تاکنو       | `tacno.webp`       | https://tacno.ir/wp-content/uploads/2024/12/tacno-logo.webp                                                                                                                                                                          |
| آرویک       | `arvik.png`        | https://www.arvik.co/wp-content/uploads/2023/06/Group-75.png                                                                                                                                                                         |
| درخشان      | `derakhshan.png`   | https://derakhshancompany.com/wp-content/uploads/2026/01/logo-scaled.png (downscaled to 600px)                                                                                                                                       |

Re-fetch before leaning on this strip in a campaign — vendor artwork changes without notice.

# Kjersti og Håkon — bryllupsside

To versjoner av samme side for bryllupet 25.–27. juni 2027 på Malungen gjestegård:

| Mappe | Hva |
|---|---|
| `klassisk/` | Brudeparets skisse, strammet opp: himmelblå hero med blomstereng, lyseblå/hvite bånd, program med strektegninger, bildestripe, gave og QR. |
| `kreativ/` | Renere tolkning: store navn og et kornblomstfoto øverst, og et program der himmelen følger sola over Malungen time for time (regnet ut for 25.–27. juni 2027). |

Begge er ren HTML/CSS/JS uten byggesteg, som Ragnhild & Vetle-siden.

Begge har samme fanerad øverst: **Forside · Program · Praktisk · Svar · Gave**. Forsiden er én lang side med alt, mens de andre fanene viser bare sin egen del. Hver fane er sin egen visning, styrt av adressen (`#program`, `#svar` osv.), så lenker kan deles direkte og tilbakeknappen virker. Svar-fanen er uthevet, og forsiden har «Svar nå»-knapp og en kort oversikt over når, hvor og svarfrist.

## Hva som ligger ute nå

Forsiden på kjerstioghakon.no er en midlertidig «sett av datoen»-side (`index.html` + `assets/`) med to silkebånd i three.js (`assets/threads.js`) som flettes tettere jo nærmere dagen kommer, nedtelling og kalenderfil, til paret har sendt bilder og detaljer. Designene ligger fortsatt på `/klassisk/` og `/kreativ/` (lenket fra `/utkast/`), men lenkes ikke fra forsiden og er merket noindex.

For å lansere: erstatt `index.html` med valgt versjon (eller la den sende videre dit).

## Kjøre lokalt

```sh
python3 -m http.server 5317
# http://127.0.0.1:5317/            «sett av datoen»-siden
# http://127.0.0.1:5317/utkast/     velg versjon
# http://127.0.0.1:5317/klassisk/
# http://127.0.0.1:5317/kreativ/
# http://127.0.0.1:5317/klassisk/#svar   rett til svarskjemaet
```

## Må fylles inn før lansering

Plassholdere vises som røde, stiplede felt på siden (`.fyll`):

- **Kontonummer** for overnatting (1500 kr per person) og for gavebidrag
- **Toastmastere**: e-post og telefon. Navnene (Thea von Hirsch, Håkon Kjernæs) er lest av en lavoppløst skisse og må sjekkes.
- **Ønskeliste-lenke**: peker nå til `https://onskeskyen.no/`. Bytt URL i `index.html` og lag ny QR (`img/qr-onskeliste.svg`).
- **Svarfrist**: satt til 1. mars 2027.
- **Bekreftelse på e-post**: svar lagres, men det sendes ingen e-post ennå. Kan kobles på med EmailJS slik som i `Rag_vetl_bryllup`.
- **Bilder av paret**: `couple-1/2/3` er stand-in-bilder fra Unsplash. Bytt med parets egne (4:5 stående, ca. 1200 px bredde, webp).
- Tekstene «Endelig / sier vi ja» (klassisk) og kveldsprogrammet fredag 21.00 er forslag.

## Bildekilder

Kreditering er fjernet fra sidene fordi bildene skal byttes. Gjestegård-fotoet (CC BY-SA) krever kreditering så lenge det brukes.

- Malungen gjestegård: Bene Riobó, [CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Malungen_Gjesteg%C3%A5rd.jpg) (krever kreditering, står i footer)
- Prestekrage-plansje: Fitschen og Schmeil, *Pflanzen der Heimat*, 1913, offentlig eie
- Kornblomsteng: Gerda Arendt, [CC0](https://commons.wikimedia.org/wiki/File:Cornflower_field,_Eschenhahn.jpg)
- Stand-in parbilder og prestekrager i vase: Unsplash-lisens
- Strektegningene (grill, vin, frokost, hjerte, brudepar) og QR-koden er laget for prosjektet

## Teknisk, kreativ versjon

- Programhimmelen: `sunPosition()` i `main.js` regner solhøyde og asimut for Malungen (60,77° N, 11,45° Ø). Scrollposisjonen mellom to programpunkter gjøres om til et klokkeslett, så natta mellom fredag og lørdag går gjennom skumring og soloppgang. En smal linje under menyen viser klokkeslett og solhøyde.
- `prefers-reduced-motion` slår av overgangene.

## Svar (Supabase)

Svarene lagres i tabellen `kh_responses` i samme Supabase-prosjekt som Ragnhild & Vetle (`bevrttmvumfodpkauiio`). Oppsettet ligger i `supabase/kh_responses.sql`.

- Én rad per gjest. Gjester sendt i samme skjema deler `household_id`.
- `allergies` inneholder avkryssede valg (gluten, laktose, nøtter, skalldyr, fisk, egg, vegetar, vegan) og fritekst, kommaseparert.
- Den offentlige nøkkelen i `main.js` kan bare legge til rader, ikke lese, endre eller slette, verken her eller i R&V sin `responses`. Testet mot live-databasen 2026-10-06.
- Les svarene i Supabase-dashbordet (Table Editor → `kh_responses`) eller med service_role-nøkkelen fra et lokalt skript. Den nøkkelen skal aldri inn i repoet.
- Alle med tilgang til prosjektets organisasjon i Supabase ser begge bryllupenes gjestelister.

## Publisering

GitHub Pages fra `main` (rotmappen), med eget domene `www.kjerstioghakon.no` (filen `CNAME`). DNS ligger hos Domeneshop:

| Type | Navn | Verdi |
|---|---|---|
| A | (tom / @) | 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153 |
| AAAA | (tom / @) | 2606:50c0:8000::153, 2606:50c0:8001::153, 2606:50c0:8002::153, 2606:50c0:8003::153 |
| CNAME | www | magicdocjr.github.io |

Alle sidene har `noindex` til ekte bilder og detaljer er på plass. Når paret har valgt versjon, flytt den til roten (eller la `index.html` videresende dit).

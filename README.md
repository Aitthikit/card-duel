# Battle of Talingchan — Card Duel

**English** · [ภาษาไทย](README.th.md)

A web version of the Battle of Talingchan trading card game. Duel a bot at four difficulty levels, or play a friend online on two devices.
Rules follow Rule Book ver. 3.2. Card data comes from [bottcg.com](https://bottcg.com).

**Play now: https://aitthikit.github.io/card-duel/**

## Getting started

The site asks for an ID and password first. Ask the site owner for them. Your browser remembers the login after the first time.

1. Switch the **ภาษา / Language** box (top right of the start screen) to **English**.
2. Pick **Your Deck** and the **Bot's Deck** (Starter Decks KD01–KD04, or a Deck you built).
3. Pick the **Bot level** and press **Start duel**.
4. At the start, choose any cards in hand you want to replace (or keep them all).

English mode translates the buttons, game messages and card effect text. Card art, card names and Symbols stay in Thai, as printed on the real cards, so you can match them to the pictures. A few rarer game messages are still in Thai.

If the site still shows an old version after an update, press `Ctrl + F5` once.

### Bot levels

| Level | How it plays |
|---|---|
| Easy | The original bot. Plays cards straight away and often spends Magic as GEM |
| Normal | Keeps React Magic and useful Magic in hand, pays GEM with the cards it needs least, and won't summon if it has to throw away too many good cards |
| Hard | Before each move (summon, Magic, which target to attack, or stop) it tries every option on a copy of the game and picks the one that leaves the best board. It does not know your hand |
| God | Thinks like Hard, but cheats: it sees your hand and its Deck order, and also plays out your next turn |

From bot-vs-bot games (192 games per pairing): Normal beats Easy 55% of the time, Hard beats Normal 70%, God beats Hard 64%.

### Quick rules

- **Summon**: tap an Avatar in your hand, then choose cards in hand to send to Hell as GEM until the Cost is paid. GEM color must match the card, Colorless GEM pays any color, and you can't overpay.
- **Magic**: no Cost, but you can use one of each type per turn (Normal / Modification / React / Land).
- **React Magic**: the game asks you when its condition happens. The prompt shows the card that caused it and the card (or LIFE) being targeted, and highlights both on the board.
- **Attack**: go to the Battle Phase, tap your Avatar, then choose a target. Higher POWER wins; a tie destroys both.
- You can attack LIFE when the opponent has no Avatar (or with "Egg Kick"), one card per attack. With all 5 LIFE Cards face up a player is **Critical**, and one more hit loses.
- Running out of cards in the Deck loses immediately.

## Play online with a friend

1. Both players open the site, pick **Your Deck**, and open **Play online with a friend**.
2. One player presses **Create room** and sends the 5-letter code to the other.
3. The other player types the code and presses **Join**. The game starts by itself.

- Game questions (choose a target, discard, React or not) pop up on the device of the player who must answer. The other device shows "Waiting for … to decide".
- You only see the backs of your opponent's hand, and only the number of cards in their Deck.
- The two browsers connect directly with [PeerJS](https://peerjs.com); there is no game server.
- Limits of this version: if the connection drops mid-game, that game can't be resumed, and there is no anti-cheat.

## Deck building

- **+ New Deck**: choose from all 1,514 cards in every set (ลำเอียง cards are left out). Filter by set, type, color or search. **Auto-fill** completes the Deck to 50 + 5 LIFE.
- **Edit Deck**: editing a Starter Deck saves it as a new Deck; a saved Deck is updated in place.
- **Import / Export**: copy a Deck as text to keep it or send it to a friend, then paste it back to import.
- Saved Decks live in that browser only. Clearing browser data deletes them, so export the ones you want to keep.
- Deck rules: exactly 50 Main cards, exactly one Only #1 card, at most 4 cards of the same name (or the card's own limit), and 5 LIFE cards with different names.

## Supported cards

- Card effects are implemented for most of KD01–KD04, BT01–BT11, CC01–CC02, SD01–SD09 and the promo cards (PRMO, ODY1, PRE0, SL). Reprints with the same text use the original card's ability.
- Cards from other sets play by the core rules (POWER, Cost, GEM, keywords), but their other ability text doesn't work yet.
- Cards with an SCR (Secret Rare) version show the SCR art.
- The English effect text is a translation for reading only; the game plays by the Thai card text.

### Found a card whose effect is wrong?

Some cards still don't work correctly or don't work yet. If you find one, please report it on [GitHub Issues](https://github.com/Aitthikit/card-duel/issues) or tell the site owner directly. Please include:

- the card code, e.g. `BT08-065`
- what happened in the game
- what should happen according to the real card

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css`, `ui.js` | Game screen, board and player prompts |
| `engine.js` | Game rules (Rule Book ver. 3.2) |
| `effects.js` | Each card's effect |
| `cards.js` | Data for 1,514 cards (from bottcg.com) |
| `cards_en.js`, `i18n.js` | English card effect text and the Thai / English switch |
| `bot.js` | Starter Decks and the four bot levels |
| `net.js` | Online play with room codes (PeerJS) |
| `auth.js` | Login screen (stores only a hash of the password) |
| `decks.js`, `builder.js` | Deck list, Deck rules and the Deck builder |
| `refs/` | Card images |
| `backs/`, `mats/` | Card backs and playmats |

## Run it locally

The game is plain HTML and JavaScript with nothing to install. Serve this folder with any small web server, for example:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. To try online play without the internet, open `http://localhost:8000/?loop` in two tabs of the same browser.

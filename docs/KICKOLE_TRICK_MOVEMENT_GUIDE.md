# KICKOLÉ: Trick Movement Reference

A practical guide for animating real football freestyle in KICKOLÉ. It is written for an animator or a coding agent working on rigged humanoids at 30 or 60 fps. Timings are approximate values for a skilled, relaxed freestyler. Use them as starting keys and tune them by eye against reference video.

**Units:** seconds (s), metres (m). Ball: size 5, about 0.22 m across, about 0.43 kg.
**Conventions:** "Kicking leg" means the working leg and "support leg" means the planted leg. Mirror everything for the left foot.

---

## 0. Physics you must respect (all tricks)

A ball's flight is set by gravity alone (g = 9.81 m/s²). Air time from contact back to the same height is `t = 2·√(2h/g)`.

| Apex above contact point | Total air time | Use for |
|---|---|---|
| 0.30 m | 0.49 s | low touch juggles (below the knee, ATW set-up) |
| 0.50 m (belt height from the foot) | 0.64 s | standard instep juggle |
| 0.80 m | 0.81 s | relaxed juggle, thigh to head transfer |
| 1.20 m | 0.99 s | flick-up to the neck or head |
| 2.0 m | 1.28 s | big flick |
| 3.5 m | 1.69 s | GROOVE kick (room for a 1 to 1.3 s dance) |
| 5.0 m | 2.02 s | GROOVE "big" version |

Rules:
- **Never slow the ball near its apex or speed it up after a touch "for feel".** The arc must be a parabola. Games look fake when the ball floats or snaps.
- The ball drops **back to the same spot it left** if contact was flat. A good freestyler's ball drifts less than 10 to 15 cm per touch. Drift is the player's error and the player must step to fix it. The ball never steers itself to the foot.
- **Backspin** is typical after an instep juggle: about 1 to 3 revolutions per second, with the top of the ball rotating towards the player. Thigh and head touches give little or no spin. Animate the ball's rotation; a non-spinning ball reads as fake.
- **Contact is 8 to 12 ms long in reality, which is less than one frame.** Show it as one frame of contact. Use a 1 to 2 frame visible squash on hard kicks only, never on soft touches.
- **The body part must actually meet the ball's surface on the contact frame.** No visible gap and no interpenetration over 1 cm. Solve this with IK on the contact bone, not by moving the ball.

---

## 1. Ready / idle stance

**Stance:** feet about hip to shoulder width, toes slightly out (10 to 15°). Knees soft (10 to 20° flexion). Weight on the balls of the feet, split 50/50 and shifting.
**Torso:** upright, leaning forward 5 to 10°. Shoulders relaxed and down.
**Arms:** hanging loosely with the elbows slightly bent, held a few cm away from the body. Hands open and relaxed.
**Head and eyes:** level. With a ball at the feet, the eyes go down to the ball every 2 to 4 s, then up.
**Motion loop (3 to 5 s):**
- Breathing: chest rises about 1 cm.
- Small weight shifts side to side, with the hips moving 2 to 3 cm.
- An occasional bounce on the balls of the feet.
- Every 4 to 8 s, roll the sole on top of the ball, or adjust a shoulder or the neck.
**Feet stay planted:** no foot slide at all during weight shifts. Lock the feet with IK.

**Avoid:** a statue pose with straight, locked knees. Arms glued to the sides (the "T-pose hangover"). Perfect left/right symmetry. Anything that loops with an obvious pop.

**Checklist**
- [ ] Knees soft, weight on the balls of the feet
- [ ] Feet locked to the ground, with zero sliding
- [ ] Breathing and weight shift on different, non-matching cycles
- [ ] Arms loose with slight elbow bend, asymmetrical

---

## 2. Keepy-up / instep juggle (right foot; mirror for left)

Sources: [OSA juggling key points](https://www.onlinesocceracademy.com/soccer-training-videos/juggling/juggling-a-soccer-ball-6-key-points), [Coaching American Soccer](https://coachingamericansoccer.com/introductions-to-soccer-skills/soccer-juggling/), [Football Reach](https://footballreach.com/drills/juggling-sequences), [SOCCER.COM](https://www.soccer.com/guide/how-to-juggle).

**Starting stance:** the support leg (left) is planted under the hips, knee flexed 15 to 25°, carrying about 100% of the weight during the touch. The kicking foot hovers 5 to 15 cm off the ground, slightly in front of the body.

**Contact point:** the **laces at the base of the toes** (front of the instep), touching the **bottom centre** of the ball. The foot surface is roughly horizontal: ankle **locked**, with the toes pointing slightly up, not fully pulled back to the shin.

**Height and spin:** the ball rises vertically to **belt or waist height**, about 0.4 to 0.6 m above the foot. That gives roughly 0.6 s per touch, so a relaxed rhythm is 1.4 to 1.8 touches per second. Backspin is light.

| Phase | Time | Body |
|---|---|---|
| Anticipation (ball falling) | 0.15 to 0.25 s | Kicking knee lifts slightly and the foot moves under the ball's predicted landing spot. The ball is allowed to drop **low**, to shin height or below. |
| Contact | 1 frame | Knee extends a little (10 to 20°) and the motion comes **from the knee, not the hip**. Ankle rigid. The thigh barely moves. |
| Follow-through | 0.05 to 0.10 s | The foot rises 5 to 10 cm with the ball, then stops. No big swing. |
| Recovery | 0.20 to 0.30 s | The foot drops back to hover, or touches the ground lightly. Support knee re-flexes. |

**Hips and torso:** the hips stay level, with a small counter-tilt over the support leg. The torso stays upright or leans slightly back (≤5°) at contact.
**Arms:** out to the sides at 20 to 40° from the body, elbows bent 20 to 40°. They make small balancing adjustments, with the arm opposite the kicking leg slightly forward. **Arms are never still.**
**Head and eyes:** the head tilts down 20 to 35° and the **eyes track the ball the whole time**.
**Alternating feet:** the support foot hops or re-plants slightly between touches. Expect about 1 small adjustment step every 3 to 5 touches.

**Beginner mistakes that look unnatural:** a big swing from the hip, which sends the ball over the head. A toe-poke with the toes pointing down, which sends the ball away. A loose ankle, which gives a dead bounce. A foot pulled back too far, which drives the ball into the shins. Stiff arms.
**Avoid in animation:** the ball sticking to the foot. Contact on the toe tip. The support foot sliding while the kicking leg moves. The same identical loop for every touch. Add 5 to 10% variation in height and timing.

**Checklist**
- [ ] Contact on the laces near the toes, ankle locked, foot about level
- [ ] Ball drops to shin height before the touch
- [ ] Movement from the knee, small follow-through
- [ ] Ball apex 0.4 to 0.6 m above the foot, light backspin, true parabola
- [ ] Support foot planted, with a micro-hop only on purpose
- [ ] Arms balancing, eyes on the ball

---

## 3. Foot catch / stall (on the laces)

Sources: [OSA ATW (stall set-up)](https://www.onlinesocceracademy.com/soccer-training-videos/tricks-skills/how-to-do-around-the-world-john-farnworth), [Soccer Coaching Pro (roll and flick-up)](https://www.soccercoachingpro.com/how-to-juggle-a-soccer-ball/).

**Contact point:** the ball sits in the "pocket" of the **laces where the foot meets the shin**. The toes are raised so the instep forms a shallow cradle. The ball is centred over the 2nd and 3rd toe line.
**Catch (cushioning):**
1. **Meet the ball** (0.1 s before contact): the foot rises towards the falling ball at about the speed of the ball.
2. **Contact:** move the foot **down** with the ball over 0.15 to 0.25 s and 10 to 25 cm. The knee and hip flex to absorb it. Toes up.
3. **Stall:** the foot holds at 20 to 40 cm off the ground, with the knee flexed about 90°. **Micro-balance** follows: the foot makes small 1 to 2 cm corrections every 0.2 to 0.4 s and the ball rolls slightly on the laces. The support leg is bent, the arms are wide for balance, and the eyes stay on the ball.
**Release:** a small lift of the knee and ankle pops the ball up 0.2 to 0.5 m.

**Avoid:** a ball that stops dead on the foot with no cushioning. A ball glued with zero wobble. The ball resting on the toes.

**Checklist**
- [ ] Foot gives downwards on contact
- [ ] Ball sits in the laces pocket, toes up
- [ ] Constant micro-corrections in the foot and arms during the stall

---

## 4. THIGH juggle

Source: [Coaching American Soccer](https://coachingamericansoccer.com/introductions-to-soccer-skills/soccer-juggling/), [Soccer Coaching Pro](https://www.soccercoachingpro.com/how-to-juggle-a-soccer-ball/).

**Stance:** standing on the support leg (knee about 15°). The working thigh rises from the hip.
**Contact point:** the **top of the thigh, mid-thigh, roughly 10 to 15 cm above the kneecap**. Never the knee itself. At contact the **thigh is parallel to the ground** (hip flexed about 90°), with the knee bent about 90° and the shin hanging vertically. The foot is relaxed and slightly pointed.
**Height and spin:** the ball goes up 0.3 to 0.6 m above the thigh, to about chest height, with little or no spin.

| Phase | Time | Body |
|---|---|---|
| Anticipation | 0.15 to 0.20 s | The thigh starts rising as the ball falls past chest height. |
| Contact | 1 frame | The thigh is moving up at the moment of contact (an active "pop", not a passive block). Hip flexion carries on 5 to 10°. |
| Follow-through | 0.05 to 0.1 s | The thigh stops just above horizontal. |
| Recovery | 0.2 to 0.3 s | The leg lowers. The foot lands softly or hovers for the next touch. |

**Torso:** upright, maybe leaning back 5°. **Never hunched over the ball.** **Arms:** out wide for balance. The arm on the kicking side drops slightly back as the thigh rises.
**Eyes:** follow the ball down to the thigh. The chin dips 20 to 30°.

**Mistakes and things to avoid:** the thigh angled down, which sends the ball forward. The thigh too high, which bounces the ball into the chest. Contact on the knee. The thigh rising too late so the ball hits it on the way up. The hip not rising, with only the knee bending.

**Checklist**
- [ ] Contact mid-thigh with the thigh horizontal
- [ ] Active upward pop, minimal spin
- [ ] Ball rises vertically to about chest height
- [ ] Torso upright, arms wide

---

## 5. HEAD (header juggle)

Sources: [Coaching American Soccer](https://coachingamericansoccer.com/introductions-to-soccer-skills/soccer-juggling/), [Soccer Coaching Pro](https://www.soccercoachingpro.com/how-to-juggle-a-soccer-ball/).

**Stance:** feet shoulder width, or one foot slightly forward. Knees **flexed 20 to 30°** before contact. The weight is on the balls of the feet.
**Contact point:** the **forehead at the natural hairline**, about 4 to 6 cm above the eyebrows, centre. Never the top of the skull or the face. At contact the **head is tilted back 30 to 50°**, so the forehead faces the sky.
**Power source:** **the legs straightening** (knee and ankle extension, rising onto the toes), plus a small neck nod of 5 to 10°. It is not a big neck snap.
**Height and spin:** the ball goes up 0.3 to 0.6 m above the head. A skilled player keeps it low, with almost no spin.

| Phase | Time | Body |
|---|---|---|
| Anticipation | 0.2 to 0.3 s | Knees bend to about 25°, the head tilts back and the eyes lock on the ball. The player makes small steps under the drop point. |
| Contact | 1 frame | The knees extend and the heels rise 2 to 4 cm. The forehead pushes up. |
| Follow-through | 0.1 s | The body rises to the toes and the chin lifts slightly. |
| Recovery | 0.15 to 0.25 s | The heels drop and the knees re-bend ready for the next touch. |

**Arms:** out to the sides and slightly forward, at 30 to 50°, elbows bent. Arms help balance; they never stay pinned to the sides.
**Eyes:** **always open and on the ball**, looking up through contact. The body shifts in small steps to stay under the ball.

**Mistakes and things to avoid:** contact on the crown with the head down. Eyes shut or looking forward. Ball at face level. Power from the neck only, with stiff legs. The ball going forward rather than up. Feet that don't move even though the ball drifts.

**HEAD in KICKOLÉ:** the ball must come down to the forehead. The neck alone does not "attract" the ball. If the ball lands short, the player steps under it, with 1 or 2 short steps of 0.15 s each.

**Checklist**
- [ ] Head back 30 to 50°, contact at the hairline
- [ ] Knees bend, then extend; heels rise at contact
- [ ] Ball rises 0.3 to 0.6 m, almost no spin
- [ ] Eyes open and tracking, arms out
- [ ] Feet adjust under a drifting ball

---

## 6. NECK (neck stall / neck catch)

Sources: [OSA Neck Stall](https://www.onlinesocceracademy.com/soccer-training-videos/tricks-skills/how-to-do-a-neck-stall), [Timo Löhnenbach via Netzathleten](https://www.netzathleten.de/fitness/fit-mit-den-stars/timo-loehnenbach-erklaert-den-neck-stall/), [Andrew Henderson, BBC Sport](https://www.bbc.com/sport/av/get-inspired/36480346), [Beyond Football](https://www.beyondfootball.com/freestyle-football-tutorials/how-to-catch-a-football-on-your-neck-neck-stall-tutorial-2).

**Set-up:** usually from a flick-up or juggle that sends the ball **0.8 to 1.5 m above head height**, slightly in front of the player.
**Contact point:** **the pocket between the back of the head and the upper back.** The ball sits on the base of the neck and upper shoulder blades, centred on the spine around the C7/T1 vertebrae, held in place by the back of the skull.
**Key pose ("table top"):**
- Torso **bent forward 60 to 80° at the hips**, so the upper back is close to horizontal.
- Knees bent 20 to 40°, feet shoulder width, weight on the balls of the feet.
- **Head up**: the neck is extended so the chin points forward and the eyes look ahead or slightly up, not at the ground. This makes the pocket.
- **Elbows pulled back and arms raised behind or out to the sides**, so the shoulder blades squeeze together and widen the surface.

| Phase | Time | Body |
|---|---|---|
| Track | 0.3 to 0.6 s | The player watches the ball rise and peak. The eyes follow it. |
| Turn-under | 0.25 to 0.35 s | As the ball starts falling, the player **ducks forward under it**, bending at the hips. The head comes up and the eyes lose sight of the ball. The player has to judge its landing. |
| Catch | 0.15 to 0.25 s | The ball lands on the upper back. The body **gives down** 5 to 15 cm (knees and hips bend more) to absorb the impact. |
| Stall | 0.5 to 3 s | The ball sits still in the pocket. Small balance corrections come through the hips and knees, with 1 to 2 cm sway. The arms hold back and up. |
| Release | 0.3 s | The player straightens and drops their shoulders, so the ball rolls forward over the head or is popped up, then caught on the foot or headed. |

**Eyes:** watch the ball while it rises. At the catch, **look forward or slightly up**. Looking down tips the ball off the neck (OSA).

**Mistakes and things to avoid:** an upright back, which lets the ball roll down the spine. Looking down, which lets it roll off over the head. Arms hanging down, which leaves a narrow surface. A ball that sticks to the neck with no impact give. The ball sitting on top of the head. The body bending before the ball even peaks.

**Checklist**
- [ ] Hips bend 60 to 80°, back flat like a table top
- [ ] Head up to form the pocket, eyes forward
- [ ] Elbows back and arms raised, shoulder blades together
- [ ] Downward give at the catch, then micro-balance
- [ ] Ball centred on C7/T1, not on the head

---

## 7. FLICK (high flick-up from the foot / rainbow-style)

Sources: [Soccer Coaching Pro (roll and flick-up)](https://www.soccercoachingpro.com/how-to-juggle-a-soccer-ball/), [Beyond Football tutorials](https://www.beyondfootball.com/freestyle-football-tutorials/around-the-world-atw-freestyle-football-tutorial).

### 7a. Toe-roll flick-up (the most common way to start from the ground)
1. **Roll back** (0.3 to 0.4 s): the sole of the kicking foot rests on top of the ball and rolls it back towards the player 20 to 30 cm.
2. **Toe placement** (0.1 s): the toes drop to the ground in the ball's path, so the ball rolls up onto the laces.
3. **Flick** (contact lasts about 0.1 s, the ball rolling up the foot): the knee and ankle lift sharply. The **laces scoop up under the ball**, which leaves with backspin.
4. **Follow-through:** the foot rises to about knee height. The support knee extends slightly.

### 7b. Rainbow flick (from behind)
- **Set-up:** the ball is between the feet, and the kicking foot is **behind** the ball.
- **Phases:** the **kicking foot's heel** catches the ball against the **inside of the support foot's heel**, which rolls it up the back of the support calf (0.15 to 0.2 s). The kicking heel then **flicks backwards and upwards**, with the knee flexing sharply to 100 to 120°.
- **Ball:** goes **up behind the player and arcs over the head** to land in front, with an apex 1.5 to 2.5 m and an air time of about 1.1 to 1.4 s, plus forward spin.
- **Body:** the torso leans forward 15 to 25° and the eyes look back over the shoulder, then up to find the ball as it comes over.

**FLICK in KICKOLÉ:** the gameplay flick should send the ball to **1.2 to 2.0 m above the foot**, with a 1.0 to 1.3 s air time. The player usually follows it with a HEAD or a NECK catch.
**Arms:** they rise with the flick; the arm on the kicking side swings up slightly. **Eyes:** on the ball during contact, then they follow it up.

**Avoid:** the ball leaving the foot before the foot is under it. The ball rising faster than the foot was moving. A big hip swing. No visible roll on the laces. In a rainbow, the ball passing through the head or body.

**Checklist**
- [ ] Visible roll onto the laces (or heel-to-heel squeeze for the rainbow)
- [ ] Sharp knee lift, ball apex 1.2 to 2 m, backspin (or forward spin for the rainbow)
- [ ] Eyes follow the ball up; the body sets up for the next touch

---

## 8. ATW: Around the World (outside and inside)

Sources: [Online Soccer Academy / John Farnworth](https://www.onlinesocceracademy.com/soccer-training-videos/tricks-skills/how-to-do-around-the-world-john-farnworth), [Ultra Football](https://www.ultrafootball.com/blogs/ultra-mag/how-to-do-the-around-the-world-trick), ["How to ACTUALLY do the ATW" (YouTube)](https://www.youtube.com/watch?v=TZYTtYvzd7o), [Beyond Football ATW](https://www.beyondfootball.com/freestyle-football-tutorials/around-the-world-atw-freestyle-football-tutorial), [Inside ATW (YouTube, Spanish)](https://www.youtube.com/watch?v=eJj7XEs9Wmc).

**Set-up:** a **low, vertical touch with no spin**, popped **0.3 to 0.6 m** above the foot, close to the body and directly in front of the kicking foot. Tutorials stress juggling **below the knee** before attempting the trick.

### 8a. Outside ATW (the standard one; right foot goes anticlockwise as seen from above)
| Phase | Time | Body |
|---|---|---|
| Set-up touch | 1 frame | A soft laces touch sends the ball straight up 0.3 to 0.6 m. |
| Lift and start the circle | 0.08 to 0.12 s | **While the ball is still rising**, the kicking knee lifts and the foot moves to the **inside** of the ball. |
| Orbit | 0.18 to 0.25 s | The foot passes **over the top** of the ball, going inside, then over, then outside, and comes down **on the outside** of it. The ball stays inside the circle. The circle is about 25 to 40 cm across and is driven by **hip external rotation and knee flexion**; the ankle hooks around. The foot reaches about 10 cm above the ball's top. |
| Return under | 0.08 to 0.12 s | The foot sweeps back underneath the falling ball. |
| Catch touch | 1 frame | A laces touch or stall **under the ball**, at about shin height. |

The whole orbit takes about **0.35 to 0.5 s**, matching the ball's air time. Many skilled players give a **small hop on the support leg** (OSA "Hop") during the orbit, rising 3 to 8 cm.

### 8b. Inside ATW (reverse direction)
The foot starts on the **outside** of the ball and passes over the top towards the **inside** (clockwise for the right foot, seen from above). The motion is driven by **hip internal rotation**. The knee crosses towards the body's midline, so the **kicking leg crosses in front of the support leg**. It is harder; the ball is usually popped slightly to the outside so the leg has room.

**Body (both variants):**
- **Support leg:** knee flexed 20 to 30°. Hop or rise onto the toes during the orbit.
- **Torso:** leans slightly back and away from the circling leg, by 5 to 15°, to counterbalance.
- **Arms:** **wide and active**. The arm opposite the kicking leg swings forward and out, while the same-side arm swings back. This is the biggest natural arm movement in basic freestyle.
- **Eyes:** on the ball throughout. The head tilts down 30 to 40°.

**Mistakes and things to avoid:** setting the ball too high, so the orbit is slow and floaty. Spin on the set-up. The foot going around the outside and *under* the ball, which is not a real ATW. Moving only from the knee with no hip rotation. **The kicking foot passing through the support leg or the ball** (KICKOLÉ has had this bug; use collision checks). A frozen support foot, when it should hop. Arms still.

**Checklist**
- [ ] Low (0.3 to 0.6 m), spin-free set-up
- [ ] Foot starts the circle while the ball rises, and passes over the ball's top
- [ ] Correct direction (outside: inside, then over, then outside; inside: the reverse)
- [ ] Orbit about 0.2 s, full trick 0.35 to 0.5 s
- [ ] No clipping through the ball or the support leg
- [ ] Support-leg hop, counterbalancing torso and arms
- [ ] Foot back under the ball for a clean catch touch

---

## 9. GROOVE (kick high, short dance, control the drop)

This is a KICKOLÉ showpiece. It is built from real elements: a high laces kick-up, a freestyle "**wait**" or celebration step during the ball's flight, and a **cushioned first touch** or catch on the way down.

**Phases**
1. **Big kick-up** (contact, 1 frame): a laces strike with the ankle locked. The swing comes **from the hip and knee** this time, with the knee extending fast. The ball goes straight up **3 to 5 m**, giving 1.7 to 2.0 s of air time. The follow-through rises to waist height and the arms swing up.
2. **Release and turn away** (0.15 to 0.2 s): the eyes follow the ball up for about 0.2 s, then come down to the "camera" or crowd.
3. **Dance** (**1.0 to 1.3 s**): a short, real move done **on the spot**, under or 0.5 m off the ball's drop point. Pick one per GROOVE:
   - **Samba step:** a quick ball-change on the balls of the feet (back, together, forward) at about 3 steps per second, with the hips swinging and the arms bent and loose.
   - **Shoulder shimmy and two-step:** the knees bounce on the beat and the shoulders alternate.
   - **Spin:** a 360° turn on the ball of the support foot in 0.6 to 0.8 s, arms tucked in, then a re-plant.
   - Feet **must stay planted between steps**, with no gliding.
4. **Re-acquire** (0.3 to 0.4 s before contact): the head snaps back up to find the falling ball. The player makes 1 or 2 small adjusting steps under it.
5. **Control:** the ball is now moving fast (about 8 to 10 m/s). It needs a **cushioned touch**: a foot stall that gives 20 to 30 cm, a thigh that drops away, or a neck catch with a deep knee bend. The ball should end up at less than 0.5 m height, under control.

**Eye line:** the ball, then the crowd or camera during the dance, then the ball again before the catch, early enough to prepare.

**Avoid:** dancing that slides around on the floor. A dance longer than the ball's air time. The ball hanging in the air waiting for the dance to finish. A hard, flat touch on such a fast ball with no give. The player catching the ball without looking up.

**Checklist**
- [ ] Ball apex 3 to 5 m, air time 1.7 to 2.0 s, true parabola
- [ ] Dance fits in 1.0 to 1.3 s with feet planted, on the spot
- [ ] Head back up 0.3 to 0.4 s before contact, plus adjusting steps
- [ ] Clearly cushioned control (foot, thigh or neck)

---

## 10. Global animation rules (every trick)

1. **Foot locking:** any foot on the ground has zero slide. Use IK foot pins and blend them in and out over 2 to 4 frames.
2. **Contact frame accuracy:** use IK on the contact surface (laces, thigh, forehead, neck) to the ball surface on the contact frame. A visible gap of more than 1 cm is a bug.
3. **The ball is physics, not animation:** drive the ball with ballistic flight plus spin. The body solves to meet the ball, never the other way round.
4. **Arms balance constantly:** arms counter the legs, mirror-opposite, and never stay locked at the sides.
5. **Eyes and head lead:** the head turns to the ball 0.1 to 0.2 s before the body moves.
6. **Anticipation and settle:** every touch has a small knee dip before it and a settle after it. Nothing starts or stops dead.
7. **Variation:** randomise touch height ±10%, timing ±5% and arm pose, so the loops don't repeat obviously.
8. **No clipping:** hair, shirt, the ball and the other leg are checked against each other in every trick, especially ATW and NECK.
9. **Readability on mobile:** check every trick from the gameplay camera at 30 fps on a phone screen. Contact must read clearly from the in-game camera, not only in close-ups.

---

## Sources
- Online Soccer Academy, *Juggling a soccer ball: 6 key points*: https://www.onlinesocceracademy.com/soccer-training-videos/juggling/juggling-a-soccer-ball-6-key-points
- Coaching American Soccer, *Soccer Juggling*: https://coachingamericansoccer.com/introductions-to-soccer-skills/soccer-juggling/
- Football Reach, *Juggling sequences*: https://footballreach.com/drills/juggling-sequences
- SOCCER.COM, *How to juggle*: https://www.soccer.com/guide/how-to-juggle
- Soccer Coaching Pro, *How to juggle like a pro*: https://www.soccercoachingpro.com/how-to-juggle-a-soccer-ball/
- Online Soccer Academy, *How to do a neck stall* (DJ Diveny): https://www.onlinesocceracademy.com/soccer-training-videos/tricks-skills/how-to-do-a-neck-stall
- Netzathleten, *Timo Löhnenbach explains the neck stall*: https://www.netzathleten.de/fitness/fit-mit-den-stars/timo-loehnenbach-erklaert-den-neck-stall/
- BBC Sport, *Andrew Henderson explains the neck stall*: https://www.bbc.com/sport/av/get-inspired/36480346
- Beyond Football, *Neck stall tutorial*: https://www.beyondfootball.com/freestyle-football-tutorials/how-to-catch-a-football-on-your-neck-neck-stall-tutorial-2
- Online Soccer Academy / John Farnworth, *How to do Around the World*: https://www.onlinesocceracademy.com/soccer-training-videos/tricks-skills/how-to-do-around-the-world-john-farnworth
- Ultra Football, *How to do the Around the World*: https://www.ultrafootball.com/blogs/ultra-mag/how-to-do-the-around-the-world-trick
- Beyond Football, *Around the World tutorial*: https://www.beyondfootball.com/freestyle-football-tutorials/around-the-world-atw-freestyle-football-tutorial
- YouTube, *How to ACTUALLY do the Around the World*: https://www.youtube.com/watch?v=TZYTtYvzd7o
- YouTube, *Inside ATW (Vuelta al mundo interna)*: https://www.youtube.com/watch?v=eJj7XEs9Wmc

*Note: joint angles and timings are reference estimates from tutorial technique and ballistic physics, not lab motion-capture. Verify against slow-motion video of real freestylers.*

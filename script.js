(() => {
  const hero = document.querySelector('#living-hero');
  const habitat = document.querySelector('#animal-habitat');
  const animals = [...document.querySelectorAll('.animal')];
  const target = document.querySelector('#animal-target');
  const resetButton = document.querySelector('#reset-animals');
  const status = document.querySelector('#animal-status');
  const instruction = document.querySelector('#living-instructions');
  const modeButtons = [...document.querySelectorAll('[data-interaction-mode]')];
  const pathLayer = document.querySelector('#path-layer');
  const pathElement = document.querySelector('#drawn-path');
  const pathEcho = document.querySelector('#drawn-path-echo');

  if (!hero || !habitat || !animals.length || !resetButton || !pathLayer || !pathElement || !pathEcho) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const homes = new Map();
  const states = new WeakMap();
  const responseText = {
    dachshund: {
      primary: 'The dachshund shakes its head and lets its ears follow.',
      secondary: 'The dachshund lifts its head for a long yawn.',
      idle: 'The dachshund sniffs the air.'
    },
    cat: {
      primary: 'The cat reaches forward into a long stretch.',
      secondary: 'The cat arches into a slow yawn.',
      idle: 'The cat looks around and flicks its tail.'
    },
    dog: {
      primary: 'The small dog gives a quick tail wag and head tilt.',
      secondary: 'The small dog drops into a play bow.',
      idle: 'The small dog listens, then settles.'
    },
    bird: {
      primary: 'The bird makes a small hop and wing flutter.',
      secondary: 'The bird opens both wings for a larger flap.',
      idle: 'The bird looks around from side to side.'
    },
    rabbit: {
      primary: 'The rabbit twitches both ears.',
      secondary: 'The rabbit compresses and makes a small jump.',
      idle: 'The rabbit shifts and listens.'
    }
  };
  const reactionDuration = {
    dachshund: { primary: 820, secondary: 1050, idle: 820 },
    cat: { primary: 980, secondary: 1120, idle: 900 },
    dog: { primary: 780, secondary: 1000, idle: 800 },
    bird: { primary: 650, secondary: 920, idle: 720 },
    rabbit: { primary: 650, secondary: 940, idle: 720 }
  };
  const accentColors = {
    dachshund: '#708aa7',
    cat: '#62765d',
    dog: '#5f6662',
    bird: '#708aa7',
    rabbit: '#bf9869'
  };
  let activeAnimal = null;
  let lastActivity = Date.now();
  let idleTimer = null;
  let arrivalTimer = null;
  let interactionMode = 'interact';
  let drawing = null;
  let pathFollowing = false;
  let pathFadeTimer = null;

  const randomBetween = (min, max) => Math.random() * (max - min) + min;
  const announce = (message) => {
    if (status) status.textContent = message;
  };

  function getPosition(animal) {
    const state = states.get(animal);
    return { x: state.x, y: state.y };
  }

  function setPosition(animal, x, y, clamp = true) {
    const state = states.get(animal);
    state.x = clamp ? Math.min(94, Math.max(6, x)) : x;
    state.y = clamp ? Math.min(90, Math.max(10, y)) : y;
    animal.style.setProperty('--animal-x', state.x + '%');
    animal.style.setProperty('--animal-y', state.y + '%');
  }

  function clearReaction(animal) {
    const state = states.get(animal);
    window.clearTimeout(state.reactionTimer);
    animal.classList.remove(
      'reaction-primary',
      'reaction-secondary',
      'reaction-idle',
      'reduced-response',
      'is-settling'
    );
  }

  function react(animal, kind, shouldAnnounce = true) {
    if (animal.classList.contains('resident--waiting')) return;
    const type = animal.dataset.animal;
    const state = states.get(animal);
    if (shouldAnnounce) lastActivity = Date.now();
    clearReaction(animal);

    if (reducedMotion.matches) {
      animal.classList.add('reduced-response');
      state.reactionTimer = window.setTimeout(() => animal.classList.remove('reduced-response'), 500);
      if (shouldAnnounce) announce(responseText[type][kind] + ' Motion is minimized.');
      return;
    }

    animal.classList.add('reaction-' + kind);
    state.reactionTimer = window.setTimeout(() => {
      animal.classList.remove('reaction-' + kind);
    }, reactionDuration[type][kind]);
    if (shouldAnnounce) announce(responseText[type][kind]);
  }

  function travelTo(animal, x, y, shouldAnnounce = true) {
    const state = states.get(animal);
    const from = getPosition(animal);
    const clampedX = Math.min(94, Math.max(6, x));
    const clampedY = Math.min(90, Math.max(10, y));
    const bounds = habitat.getBoundingClientRect();
    const distance = Math.hypot(
      (clampedX - from.x) * bounds.width / 100,
      (clampedY - from.y) * bounds.height / 100
    );
    const type = animal.dataset.animal;
    const speed = type === 'bird' ? 360 : type === 'rabbit' ? 255 : type === 'cat' ? 245 : 295;
    const duration = reducedMotion.matches ? 0 : Math.min(1700, Math.max(420, distance / speed * 1000));

    cancelPathAnimation(animal);
    window.clearTimeout(state.travelTimer);
    animal.classList.remove('is-grabbed');
    if (duration) {
      animal.style.setProperty('--travel-time', duration + 'ms');
      animal.classList.add('is-traveling');
    }
    setPosition(animal, clampedX, clampedY);
    state.travelTimer = window.setTimeout(() => {
      animal.classList.remove('is-traveling');
    }, duration + 60);

    if (shouldAnnounce) {
      const movement = type === 'rabbit' ? 'hops' : type === 'bird' ? 'flutters and hops' : type === 'cat' ? 'walks' : 'trots';
      announce(animal.dataset.name + ' ' + movement + ' toward the new position.');
    }
    return duration;
  }

  function handleTap(animal, clientX, clientY) {
    const state = states.get(animal);
    const now = performance.now();
    const closeEnough = state.lastTapPoint
      ? Math.hypot(clientX - state.lastTapPoint.x, clientY - state.lastTapPoint.y) < 26
      : false;

    if (now - state.lastTap < 340 && closeEnough) {
      window.clearTimeout(state.tapTimer);
      state.lastTap = 0;
      state.lastTapPoint = null;
      react(animal, 'secondary');
      return;
    }

    state.lastTap = now;
    state.lastTapPoint = { x: clientX, y: clientY };
    window.clearTimeout(state.tapTimer);
    state.tapTimer = window.setTimeout(() => {
      react(animal, 'primary');
      state.lastTap = 0;
      state.lastTapPoint = null;
    }, 300);
  }

  function habitatPoint(event) {
    const bounds = habitat.getBoundingClientRect();
    return {
      px: Math.min(bounds.width - 12, Math.max(12, event.clientX - bounds.left)),
      py: Math.min(bounds.height - 12, Math.max(12, event.clientY - bounds.top)),
      x: (event.clientX - bounds.left) / bounds.width * 100,
      y: (event.clientY - bounds.top) / bounds.height * 100
    };
  }

  function showTarget(point) {
    if (!target) return;
    target.style.left = point.px + 'px';
    target.style.top = point.py + 'px';
    target.classList.add('is-visible');
  }

  function hideTarget() {
    target?.classList.remove('is-visible');
  }

  function visibleAnimals() {
    return animals.filter((animal) => !animal.classList.contains('resident--waiting'));
  }

  function introduceResident(animal) {
    if (!animal || !animal.classList.contains('resident--waiting')) return;
    const state = states.get(animal);
    const home = homes.get(animal);
    animal.classList.remove('resident--waiting');
    animal.classList.add('resident--arriving');
    animal.setAttribute('tabindex', '0');
    animal.removeAttribute('aria-hidden');
    announce(animal.dataset.name + ' has wandered into the portfolio.');
    if (reducedMotion.matches) {
      setPosition(animal, home.x, home.y);
      animal.classList.remove('resident--arriving');
      animal.classList.add('reduced-response');
      window.setTimeout(() => animal.classList.remove('reduced-response'), 500);
      state.introduced = true;
      return;
    }
    window.requestAnimationFrame(() => {
      const duration = travelTo(animal, home.x, home.y, false);
      window.setTimeout(() => {
        animal.classList.remove('resident--arriving');
        react(animal, 'idle', false);
      }, duration + 80);
    });
    state.introduced = true;
  }

  function scheduleArrival(delay) {
    window.clearTimeout(arrivalTimer);
    arrivalTimer = window.setTimeout(() => {
      const waiting = animals.filter((animal) => animal.classList.contains('resident--waiting'));
      if (!waiting.length) return;
      if (Date.now() - lastActivity < 6500 || activeAnimal || drawing || pathFollowing) {
        scheduleArrival(4500);
        return;
      }
      const next = waiting[Math.floor(Math.random() * waiting.length)];
      introduceResident(next);
      if (waiting.length > 1) scheduleArrival(randomBetween(14000, 21000));
    }, delay);
  }

  function restoreWaitingResidents() {
    animals.forEach((animal) => {
      const state = states.get(animal);
      if (!state.initiallyWaiting) return;
      cancelPathAnimation(animal);
      clearReaction(animal);
      animal.classList.add('resident--waiting');
      animal.classList.remove('resident--arriving', 'is-traveling', 'is-facing-left');
      animal.setAttribute('tabindex', '-1');
      animal.setAttribute('aria-hidden', 'true');
      setPosition(animal, state.entryX, state.entryY, false);
      state.introduced = false;
    });
  }

  function setMode(mode, shouldAnnounce = true) {
    interactionMode = mode;
    hero.classList.toggle('is-path-mode', mode === 'path');
    modeButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.interactionMode === mode));
    });
    if (instruction) {
      instruction.textContent = mode === 'path'
        ? 'Draw a path for a nearby resident.'
        : 'Meet the residents — try interacting with them.';
    }
    if (mode !== 'path' && drawing) cancelDrawing();
    if (shouldAnnounce) {
      announce(mode === 'path'
        ? 'Draw Path mode active. Draw through open hero space. Press Escape to exit.'
        : 'Interaction mode active. Residents can be clicked, tapped, dragged, or moved with the keyboard.');
    }
  }

  function pointForPath(event) {
    const bounds = hero.getBoundingClientRect();
    return {
      x: Math.min(bounds.width, Math.max(0, event.clientX - bounds.left)),
      y: Math.min(bounds.height, Math.max(0, event.clientY - bounds.top))
    };
  }

  function pathData(points) {
    if (!points.length) return '';
    if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
    let d = 'M ' + points[0].x + ' ' + points[0].y;
    for (let index = 1; index < points.length - 1; index += 1) {
      const midpoint = {
        x: (points[index].x + points[index + 1].x) / 2,
        y: (points[index].y + points[index + 1].y) / 2
      };
      d += ' Q ' + points[index].x + ' ' + points[index].y + ' ' + midpoint.x + ' ' + midpoint.y;
    }
    const last = points[points.length - 1];
    d += ' L ' + last.x + ' ' + last.y;
    return d;
  }

  function updateDrawnPath(points) {
    const d = pathData(points);
    pathElement.setAttribute('d', d);
    pathEcho.setAttribute('d', d);
  }

  function smoothPoints(points) {
    if (points.length < 4) return points;
    const smoothed = [points[0]];
    for (let index = 1; index < points.length - 1; index += 1) {
      smoothed.push({
        x: (points[index - 1].x + points[index].x * 2 + points[index + 1].x) / 4,
        y: (points[index - 1].y + points[index].y * 2 + points[index + 1].y) / 4
      });
    }
    smoothed.push(points[points.length - 1]);
    return smoothed;
  }

  function pathLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    return total;
  }

  function resamplePath(points, spacing = 10) {
    if (points.length < 2) return points;
    const result = [points[0]];
    let remainder = 0;
    for (let index = 1; index < points.length; index += 1) {
      const start = { ...points[index - 1] };
      const end = points[index];
      let segment = Math.hypot(end.x - start.x, end.y - start.y);
      if (!segment) continue;
      let traveled = spacing - remainder;
      while (traveled <= segment) {
        const ratio = traveled / segment;
        result.push({
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio
        });
        traveled += spacing;
      }
      remainder = segment - (traveled - spacing);
    }
    const last = points[points.length - 1];
    const resultLast = result[result.length - 1];
    if (Math.hypot(last.x - resultLast.x, last.y - resultLast.y) > 2) result.push(last);
    return result;
  }

  function closestAnimalTo(point) {
    const bounds = hero.getBoundingClientRect();
    return visibleAnimals()
      .filter((animal) => !animal.classList.contains('is-path-following'))
      .map((animal) => {
        const position = getPosition(animal);
        const x = position.x / 100 * bounds.width;
        const y = position.y / 100 * bounds.height;
        return { animal, distance: Math.hypot(point.x - x, point.y - y) };
      })
      .sort((a, b) => a.distance - b.distance)[0]?.animal || null;
  }

  function cancelPathAnimation(animal) {
    const state = states.get(animal);
    if (!state?.pathFrame) return;
    window.cancelAnimationFrame(state.pathFrame);
    state.pathFrame = null;
    animal.classList.remove('is-path-following');
  }

  function pathPointAtDistance(points, segmentLengths, distance) {
    let remaining = distance;
    for (let index = 1; index < points.length; index += 1) {
      const length = segmentLengths[index - 1];
      if (remaining <= length) {
        const ratio = length ? remaining / length : 0;
        return {
          x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
          y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio
        };
      }
      remaining -= length;
    }
    return points[points.length - 1];
  }

  function fadePath() {
    window.clearTimeout(pathFadeTimer);
    pathFadeTimer = window.setTimeout(() => {
      pathLayer.classList.add('is-fading');
      window.setTimeout(() => {
        pathElement.setAttribute('d', '');
        pathEcho.setAttribute('d', '');
        pathLayer.classList.remove('is-active', 'is-drawing', 'is-following', 'is-fading');
        pathLayer.style.removeProperty('--path-color');
      }, 760);
    }, 1050);
  }

  function followPath(animal, points) {
    const bounds = hero.getBoundingClientRect();
    const state = states.get(animal);
    const type = animal.dataset.animal;
    const endpoint = points[points.length - 1];

    if (reducedMotion.matches) {
      setPosition(animal, endpoint.x / bounds.width * 100, endpoint.y / bounds.height * 100);
      animal.classList.add('reduced-response');
      window.setTimeout(() => animal.classList.remove('reduced-response'), 500);
      pathFollowing = false;
      announce(animal.dataset.name + ' moved to the end of the path with motion minimized.');
      fadePath();
      return;
    }

    const segmentLengths = [];
    let totalLength = 0;
    for (let index = 1; index < points.length; index += 1) {
      const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      segmentLengths.push(length);
      totalLength += length;
    }
    const speed = type === 'bird' ? 250 : type === 'rabbit' ? 175 : type === 'cat' ? 205 : 235;
    const duration = Math.min(6200, Math.max(1100, totalLength / speed * 1000));
    const started = performance.now();
    let lastPoint = points[0];

    cancelPathAnimation(animal);
    animal.classList.add('is-path-following', 'is-traveling');
    animal.style.setProperty('--travel-time', '0ms');
    pathLayer.classList.add('is-following');
    announce(animal.dataset.name + ' noticed the line and is following its bends.');

    function frame(now) {
      const progress = Math.min(1, (now - started) / duration);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const point = pathPointAtDistance(points, segmentLengths, totalLength * eased);
      const dx = point.x - lastPoint.x;
      if (dx < -1.1) animal.classList.add('is-facing-left');
      if (dx > 1.1) animal.classList.remove('is-facing-left');
      setPosition(animal, point.x / bounds.width * 100, point.y / bounds.height * 100);
      lastPoint = point;

      if (progress < 1) {
        state.pathFrame = window.requestAnimationFrame(frame);
        return;
      }

      state.pathFrame = null;
      animal.classList.remove('is-path-following', 'is-traveling');
      animal.classList.add('is-settling');
      window.setTimeout(() => animal.classList.remove('is-settling'), 650);
      pathFollowing = false;
      announce(animal.dataset.name + ' reached the end of the path and settled there.');
      fadePath();
    }

    state.pathFrame = window.requestAnimationFrame(frame);
  }

  function beginFollowing(animal, points) {
    const bounds = hero.getBoundingClientRect();
    const start = points[0];
    const startX = start.x / bounds.width * 100;
    const startY = start.y / bounds.height * 100;
    pathFollowing = true;
    pathLayer.style.setProperty('--path-color', accentColors[animal.dataset.animal]);
    pathLayer.classList.add('is-active', 'is-following');
    react(animal, 'primary', false);

    const delay = reducedMotion.matches ? 80 : 410;
    window.setTimeout(() => {
      const approachDuration = travelTo(animal, startX, startY, false);
      window.setTimeout(() => followPath(animal, points), approachDuration + 40);
    }, delay);
  }

  function cancelDrawing() {
    drawing = null;
    pathLayer.classList.remove('is-drawing');
    if (!pathFollowing) {
      pathElement.setAttribute('d', '');
      pathEcho.setAttribute('d', '');
      pathLayer.classList.remove('is-active', 'is-following', 'is-fading');
    }
  }

  function finishDrawing() {
    if (!drawing) return;
    const rawPoints = drawing.points;
    drawing = null;
    pathLayer.classList.remove('is-drawing');
    const points = resamplePath(smoothPoints(rawPoints), 10);
    if (points.length < 4 || pathLength(points) < 45) {
      cancelDrawing();
      announce('Draw a slightly longer path for a nearby resident.');
      return;
    }
    updateDrawnPath(points);
    const follower = closestAnimalTo(points[0]);
    if (!follower) {
      cancelDrawing();
      return;
    }
    beginFollowing(follower, points);
  }

  animals.forEach((animal) => {
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const homeX = mobile && animal.dataset.mobileX
      ? parseFloat(animal.dataset.mobileX)
      : parseFloat(animal.style.getPropertyValue('--animal-x'));
    const homeY = mobile && animal.dataset.mobileY
      ? parseFloat(animal.dataset.mobileY)
      : parseFloat(animal.style.getPropertyValue('--animal-y'));
    const initiallyWaiting = animal.classList.contains('resident--waiting');
    const entryX = animal.dataset.animal === 'rabbit' ? 108 : -8;
    const entryY = homeY;
    homes.set(animal, { x: homeX, y: homeY });
    states.set(animal, {
      x: initiallyWaiting ? entryX : homeX,
      y: entryY,
      entryX,
      entryY,
      initiallyWaiting,
      introduced: !initiallyWaiting,
      press: null,
      lastTap: 0,
      lastTapPoint: null,
      tapTimer: null,
      reactionTimer: null,
      travelTimer: null,
      pathFrame: null
    });
    setPosition(animal, initiallyWaiting ? entryX : homeX, entryY, false);

    animal.addEventListener('pointerdown', (event) => {
      if (interactionMode !== 'interact' || animal.classList.contains('resident--waiting')) return;
      if (event.button !== undefined && event.button !== 0) return;
      const state = states.get(animal);
      state.press = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        cancelledForScroll: false,
        point: habitatPoint(event)
      };
      activeAnimal = animal;
      animal.classList.add('is-pressed');
      lastActivity = Date.now();
    });

    animal.addEventListener('keydown', (event) => {
      if (animal.classList.contains('resident--waiting')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        react(animal, event.shiftKey ? 'secondary' : 'primary');
        return;
      }

      const moves = {
        ArrowLeft: [-7, 0],
        ArrowRight: [7, 0],
        ArrowUp: [0, -7],
        ArrowDown: [0, 7]
      };
      if (!moves[event.key]) return;
      event.preventDefault();
      const current = getPosition(animal);
      travelTo(animal, current.x + moves[event.key][0], current.y + moves[event.key][1]);
    });
  });

  window.addEventListener('pointermove', (event) => {
    if (!activeAnimal) return;
    const state = states.get(activeAnimal);
    const press = state.press;
    if (!press || press.pointerId !== event.pointerId || press.cancelledForScroll) return;

    const dx = event.clientX - press.startX;
    const dy = event.clientY - press.startY;
    const distance = Math.hypot(dx, dy);
    const threshold = press.pointerType === 'touch' ? 14 : 6;

    if (!press.dragging && press.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) * 1.15 && distance > threshold) {
      press.cancelledForScroll = true;
      activeAnimal.classList.remove('is-pressed');
      return;
    }

    if (!press.dragging && distance > threshold) {
      press.dragging = true;
      window.clearTimeout(state.tapTimer);
      activeAnimal.classList.add('is-grabbed');
      activeAnimal.classList.remove('is-pressed');
    }

    if (!press.dragging) return;
    if (press.pointerType !== 'touch') event.preventDefault();
    press.point = habitatPoint(event);
    showTarget(press.point);
  }, { passive: false });

  window.addEventListener('pointerup', (event) => {
    if (!activeAnimal) return;
    const animal = activeAnimal;
    const state = states.get(animal);
    const press = state.press;
    if (!press || press.pointerId !== event.pointerId) return;

    animal.classList.remove('is-pressed');
    if (press.dragging) {
      hideTarget();
      travelTo(animal, press.point.x, press.point.y);
    } else if (!press.cancelledForScroll) {
      handleTap(animal, event.clientX, event.clientY);
    }

    state.press = null;
    activeAnimal = null;
  });

  window.addEventListener('pointercancel', () => {
    if (!activeAnimal) return;
    const state = states.get(activeAnimal);
    activeAnimal.classList.remove('is-pressed', 'is-grabbed');
    state.press = null;
    activeAnimal = null;
    hideTarget();
  });

  hero.addEventListener('pointerdown', (event) => {
    if (interactionMode !== 'path' || pathFollowing || event.target.closest('button, a')) return;
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    lastActivity = Date.now();
    window.clearTimeout(pathFadeTimer);
    pathLayer.classList.remove('is-fading', 'is-following');
    pathLayer.classList.add('is-active', 'is-drawing');
    pathLayer.style.removeProperty('--path-color');
    const bounds = hero.getBoundingClientRect();
    pathLayer.setAttribute('viewBox', '0 0 ' + bounds.width + ' ' + bounds.height);
    const point = pointForPath(event);
    drawing = {
      pointerId: event.pointerId,
      points: [point]
    };
    updateDrawnPath(drawing.points);
    hero.setPointerCapture?.(event.pointerId);
  });

  hero.addEventListener('pointermove', (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointForPath(event);
    const last = drawing.points[drawing.points.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) < 3.5) return;
    drawing.points.push(point);
    updateDrawnPath(drawing.points);
  });

  hero.addEventListener('pointerup', (event) => {
    if (!drawing || drawing.pointerId !== event.pointerId) return;
    event.preventDefault();
    hero.releasePointerCapture?.(event.pointerId);
    finishDrawing();
  });

  hero.addEventListener('pointercancel', () => {
    if (drawing) cancelDrawing();
  });

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.interactionMode));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && interactionMode === 'path') {
      setMode('interact');
      modeButtons.find((button) => button.dataset.interactionMode === 'interact')?.focus();
    }
  });

  resetButton.addEventListener('click', () => {
    lastActivity = Date.now();
    window.clearTimeout(idleTimer);
    window.clearTimeout(arrivalTimer);
    clearPathState();
    setMode('interact', false);
    restoreWaitingResidents();
    animals.forEach((animal) => {
      const state = states.get(animal);
      if (state.initiallyWaiting) return;
      cancelPathAnimation(animal);
      clearReaction(animal);
      const home = homes.get(animal);
      travelTo(animal, home.x, home.y, false);
      animal.classList.remove('is-facing-left');
    });
    announce('The original three residents are returning to their starting places.');
    scheduleIdle();
    scheduleArrival(randomBetween(9000, 13000));
  });

  function clearPathState() {
    drawing = null;
    pathFollowing = false;
    window.clearTimeout(pathFadeTimer);
    pathElement.setAttribute('d', '');
    pathEcho.setAttribute('d', '');
    pathLayer.classList.remove('is-active', 'is-drawing', 'is-following', 'is-fading');
    pathLayer.style.removeProperty('--path-color');
  }

  document.querySelectorAll('.living-project').forEach((project) => {
    const animal = document.querySelector('[data-animal="' + project.dataset.projectAnimal + '"]');
    if (!animal) return;
    const respond = () => {
      if (animal.classList.contains('resident--waiting')) return;
      if (project.classList.contains('living-project--album')) animal.classList.add('is-facing-left');
      else animal.classList.remove('is-facing-left');
      react(animal, 'primary', false);
    };
    project.addEventListener('mouseenter', respond);
    project.addEventListener('focus', respond);
  });

  function scheduleIdle() {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (!reducedMotion.matches && !document.hidden && Date.now() - lastActivity > 6500 && !activeAnimal && !drawing && !pathFollowing) {
        const available = visibleAnimals().filter((animal) => !animal.classList.contains('is-traveling'));
        const animal = available[Math.floor(Math.random() * available.length)];
        if (animal) {
          if (Math.random() < 0.24) {
            const current = getPosition(animal);
            travelTo(animal, current.x + randomBetween(-3.5, 3.5), current.y + randomBetween(-1.8, 1.8), false);
          } else {
            react(animal, 'idle', false);
          }
        }
      }
      scheduleIdle();
    }, randomBetween(8500, 14500));
  }

  reducedMotion.addEventListener?.('change', () => {
    animals.forEach((animal) => {
      clearReaction(animal);
      cancelPathAnimation(animal);
      animal.classList.remove('is-traveling');
    });
    window.clearTimeout(arrivalTimer);
    scheduleArrival(randomBetween(9000, 13000));
  });

  setMode('interact', false);
  scheduleIdle();
  scheduleArrival(randomBetween(9000, 13000));
})();

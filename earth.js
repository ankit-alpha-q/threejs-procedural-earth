import * as THREE from 'three';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setSize(
  canvas.clientWidth, canvas.clientHeight, false
);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45, canvas.clientWidth / canvas.clientHeight,
  0.1, 200
);
const fit = Math.max(1, 1.1 / camera.aspect);
camera.position.set(0, 0, 7 * fit);

const NOISE = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1) * 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = 0.0;
    for (int k = 0; k < 8; k++) {
      vec3 o = vec3(k & 1, (k >> 1) & 1, k >> 2);
      vec3 w = mix(1.0 - f, f, o);
      n += hash(i + o) * w.x * w.y * w.z;
    }
    return n;
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 6; k++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }
`;

const ground = new THREE.ShaderMaterial({
  uniforms: {
    uSun: {
      value: new THREE.Vector3(1, 0.25, 0.6).normalize(),
    },
  },
  vertexShader: `
    varying vec3 vPos;
    varying vec3 vN;
    void main() {
      vPos = position;
      vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix
        * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: NOISE + `
    uniform vec3 uSun;
    varying vec3 vPos;
    varying vec3 vN;
    void main() {
      float h = fbm(vPos * 1.1 + 4.0);
      float land = smoothstep(0.53, 0.535, h);
      vec3 sea = mix(vec3(0.01, 0.04, 0.2),
                     vec3(0.03, 0.3, 0.55),
                     smoothstep(0.35, 0.53, h));
      vec3 col = mix(sea, vec3(0.13, 0.42, 0.14), land);
      col = mix(col, vec3(0.76, 0.7, 0.5),
                land * (1.0 - smoothstep(0.535, 0.55, h)));
      col = mix(col, vec3(0.42, 0.34, 0.26),
                land * smoothstep(0.6, 0.68, h));
      float lat = abs(vPos.y) / 1.6 + h * 0.12;
      float ice = smoothstep(0.78, 0.86, lat);
      col = mix(col, vec3(0.95), ice);
      float day = smoothstep(-0.15, 0.3, dot(vN, uSun));
      col *= 0.03 + 0.97 * day;
      float city = step(0.82, noise(vPos * 60.0));
      city *= land * (1.0 - ice);
      col += vec3(1.0, 0.72, 0.3) * city * (1.0 - day);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1.6, 128, 128),
  ground
);
scene.add(earth);

const clouds = new THREE.Mesh(
  new THREE.SphereGeometry(1.64, 96, 96),
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: ground.uniforms.uSun,
    },
    vertexShader: ground.vertexShader,
    fragmentShader: NOISE + `
      uniform float uTime;
      uniform vec3 uSun;
      varying vec3 vPos;
      varying vec3 vN;
      void main() {
        vec3 drift = vec3(uTime * 0.04, 0.0, 0.0);
        float c = fbm(vPos * 2.2 + drift);
        float a = smoothstep(0.52, 0.72, c);
        float day = smoothstep(-0.15, 0.3, dot(vN, uSun));
        gl_FragColor = vec4(vec3(day), a * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
  })
);
scene.add(clouds);

const air = new THREE.Mesh(
  new THREE.SphereGeometry(1.6 * 1.15, 64, 64),
  new THREE.ShaderMaterial({
    uniforms: { uSun: ground.uniforms.uSun },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vN = normalize(normalMatrix * normal);
        vW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix
          * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSun;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        float rim = pow(max(0.0, -vN.z), 2.5);
        float lit = smoothstep(-0.4, 0.5, dot(vW, uSun));
        vec4 blue = vec4(0.3, 0.6, 1.0, 1.0);
        gl_FragColor = blue * rim * (0.15 + lit);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
);
scene.add(air);

const far = new Float32Array(4000 * 3).map(
  () => (Math.random() - 0.5) * 120
);
const stars = new THREE.BufferGeometry();
stars.setAttribute(
  'position', new THREE.BufferAttribute(far, 3)
);
scene.add(new THREE.Points(stars,
  new THREE.PointsMaterial({
    size: 2, sizeAttenuation: false, color: '#c9d4ff',
  })
));

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  earth.rotation.y = t * 0.06;
  clouds.rotation.y = t * 0.075;
  clouds.material.uniforms.uTime.value = t;
  renderer.render(scene, camera);
});

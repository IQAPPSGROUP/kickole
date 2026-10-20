import { ShaderChunk } from 'three';

const BASIC_START = '\t#else\n\t\tfloat getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {';
const SUN_START = '\t#if NUM_SUN_LIGHT_SHADOWS > 0\n\t\tfloat getSunShadow(';

/**
 * Percentage-closer soft shadows for the basic shadow map.
 * `shadowRadius` is the light size in texels. A blocker search widens the
 * penumbra as the occluder moves away from the receiver.
 */
const PCSS_BLOCK = `\t#else

		vec2 pcssVogel( int index, int total, float phi ) {

			float golden = 2.39996323;
			float radius = sqrt( ( float( index ) + 0.5 ) / float( total ) );
			float theta = float( index ) * golden + phi;
			return vec2( cos( theta ), sin( theta ) ) * radius;

		}

		float pcssNoise( vec2 position ) {

			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );

		}

		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			float shadow = 1.0;

			shadowCoord.xyz /= shadowCoord.w;

			#ifdef USE_REVERSED_DEPTH_BUFFER

				shadowCoord.z -= shadowBias;

			#else

				shadowCoord.z += shadowBias;

			#endif

			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;

			if ( frustumTest ) {

				vec2 texel = vec2( 1.0 ) / shadowMapSize;
				float lightUv = max( shadowRadius, 1.0 ) * texel.x;
				float search = clamp( lightUv * 2.5, texel.x * 2.0, texel.x * 24.0 );
				float phi = pcssNoise( gl_FragCoord.xy ) * 6.28318530718;
				float blockerSum = 0.0;
				float blockers = 0.0;

				for ( int i = 0; i < 10; i ++ ) {

					float zSample = texture2D( shadowMap, shadowCoord.xy + pcssVogel( i, 10, phi ) * search ).r;

					#ifdef USE_REVERSED_DEPTH_BUFFER

						float closer = step( shadowCoord.z + 0.0015, zSample );

					#else

						float closer = step( zSample, shadowCoord.z - 0.0015 );

					#endif

					blockerSum += zSample * closer;
					blockers += closer;

				}

				if ( blockers < 0.5 ) {

					shadow = 1.0;

				} else {

					float average = blockerSum / blockers;

					#ifdef USE_REVERSED_DEPTH_BUFFER

						float separation = max( average - shadowCoord.z, 0.0 );

					#else

						float separation = max( shadowCoord.z - average, 0.0 );

					#endif

					float penumbra = clamp( separation * lightUv * 14.0 + texel.x, texel.x, texel.x * 14.0 );
					float lit = 0.0;

					for ( int i = 0; i < 10; i ++ ) {

						float zSample = texture2D( shadowMap, shadowCoord.xy + pcssVogel( i, 10, phi + 1.7 ) * penumbra ).r;

						#ifdef USE_REVERSED_DEPTH_BUFFER

							lit += step( zSample, shadowCoord.z );

						#else

							lit += step( shadowCoord.z, zSample );

						#endif

					}

					shadow = lit / 10.0;

				}

			}

			return mix( 1.0, shadow, shadowIntensity );

		}

	#endif

`;

let originalChunk: string | null = null;

/** Swap the basic shadow function for PCSS. Safe to call more than once. */
export function installPcss(): void {
  if (originalChunk !== null) return;
  originalChunk = ShaderChunk.shadowmap_pars_fragment;
  ShaderChunk.shadowmap_pars_fragment = withPcss(originalChunk);
}

export function restorePcss(): void {
  if (originalChunk === null) return;
  ShaderChunk.shadowmap_pars_fragment = originalChunk;
  originalChunk = null;
}

export function pcssInstalled(): boolean {
  return originalChunk !== null;
}

/** Pure rewrite so tests can check the markers without touching the live chunk. */
export function withPcss(chunk: string): string {
  const start = chunk.indexOf(BASIC_START);
  const end = chunk.indexOf(SUN_START);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('PCSS markers are missing from the shadow chunk');
  }
  return chunk.slice(0, start) + PCSS_BLOCK + chunk.slice(end);
}

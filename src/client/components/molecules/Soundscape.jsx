import React, { useEffect, useRef } from "react"
import styled from "styled-components"

/*
 * Decorative "sound ripples": breathing rings and drifting waveforms.
 * Every element has its own period so nothing moves in lockstep.
 * Static composition under reduced motion; paused offscreen and in hidden tabs.
 */

const Figure = styled.div`
  aspect-ratio: 1;
  flex: none;
  pointer-events: none;
  width: ${ ( { $size } ) => $size };

  svg { display: block; height: 100%; overflow: visible; width: 100%; }

  &[data-paused] * { animation-play-state: paused !important; }

  .ring { animation: ring-breathe var(--period) ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
  .wave { animation: wave-drift var(--period) linear infinite; }
  .shade { animation: shade-shift var(--period) ease-in-out infinite alternate; }

  @keyframes ring-breathe {
    from { opacity: .35; transform: scale(.94); }
    to { opacity: .8; transform: scale(1.05); }
  }

  /* Path repeats an 80px period; shifting by one period loops seamlessly */
  @keyframes wave-drift { from { transform: translateX(0); } to { transform: translateX(-80px); } }

  @keyframes shade-shift { from { opacity: .45; } to { opacity: .95; } }
`

// Sine-like wave spanning 80px periods (x: -40 … 280)
function wave( y, amplitude ) {
    const segment = x => `C ${ x + 13 } ${ y - amplitude }, ${ x + 27 } ${ y - amplitude }, ${ x + 40 } ${ y } S ${ x + 67 } ${ y + amplitude }, ${ x + 80 } ${ y }`
    return `M -40 ${ y } ${ [ -40, 40, 120, 200 ].map( segment ).join( ` ` ) }`
}

const rings = [
    { r: 58, color: `#7ec0d0`, period: `9.5s`, delay: `0s` },
    { r: 44, color: `#e07c5a`, period: `7.3s`, delay: `-2.1s` },
    { r: 30, color: `#f0c040`, period: `11.7s`, delay: `-5.4s` },
]

const waves = [
    { y: 80, amplitude: 9, color: `#376675`, period: `13s`, delay: `0s`, shade: `8.9s` },
    { y: 74, amplitude: 6, color: `#7ec0d0`, period: `17.5s`, delay: `-6s`, shade: `6.7s` },
    { y: 86, amplitude: 5, color: `#e07c5a`, period: `21s`, delay: `-11s`, shade: `10.3s` },
]

/**
 * Quiet animated artwork for empty and welcome moments.
 *
 * @param {object} props
 * @param {string} [props.size] - CSS width of the square figure
 * @returns {React.ReactElement}
 */
export function Soundscape( { size = `10rem` } ) {

    const figure = useRef( null )

    // Pause when scrolled out of view
    useEffect( () => {

        const element = figure.current
        if( !element || !( `IntersectionObserver` in window ) ) return undefined

        const observer = new IntersectionObserver( ( [ entry ] ) => {
            element.toggleAttribute( `data-paused`, !entry.isIntersecting )
        } )
        observer.observe( element )

        return () => observer.disconnect()

    }, [] )

    return <Figure $size={ size } aria-hidden="true" ref={ figure }>
        <svg viewBox="0 0 160 160">
            <defs>
                <clipPath id="soundscape-clip"><circle cx="80" cy="80" r="66" /></clipPath>
            </defs>
            { rings.map( ring => <circle
                className="ring"
                cx="80" cy="80" fill="none" key={ ring.r } r={ ring.r }
                stroke={ ring.color } strokeWidth="1.5"
                style={ { '--period': ring.period, animationDelay: ring.delay } }
            /> ) }
            <g clipPath="url(#soundscape-clip)">
                { waves.map( line => <g className="shade" key={ line.y } style={ { '--period': line.shade, animationDelay: line.delay } }>
                    <path
                        className="wave" d={ wave( line.y, line.amplitude ) } fill="none"
                        stroke={ line.color } strokeLinecap="round" strokeWidth="2"
                        style={ { '--period': line.period, animationDelay: line.delay } }
                    />
                </g> ) }
            </g>
        </svg>
    </Figure>

}

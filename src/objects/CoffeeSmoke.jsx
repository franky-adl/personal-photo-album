import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useControls } from "leva";
import * as THREE from "three";
import coffeeSmokeVertexShader from "../shaders/coffeeSmoke/vertex.glsl";
import coffeeSmokeFragmentShader from "../shaders/coffeeSmoke/fragment.glsl";
import { bookFocus } from "../Camera";

export default function CoffeeSmoke() {
    const meshRef = useRef();
    const materialRef = useRef();
    const perlinTexture = useTexture("./perlin.png");

    const { position, scale } = useControls("Smoke", {
        position: {
            value: { x: 0.92, y: 0.8, z: -1.51 },
            step: 0.01,
        },
        scale: {
            value: { x: 0.16, y: 0.65, z: 0.16 },
            step: 0.01,
        },
    });

    perlinTexture.wrapS = THREE.RepeatWrapping;
    perlinTexture.wrapT = THREE.RepeatWrapping;

    const uniforms = useMemo(
        () => ({
            uTime: new THREE.Uniform(0),
            uPerlinTexture: new THREE.Uniform(perlinTexture),
        }),
        [perlinTexture],
    );

    useFrame((_, delta) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value += delta * 4;
        }
        if (meshRef.current) {
            meshRef.current.visible = bookFocus.amount <= 0.99;
        }
    });

    return (
        <mesh
            ref={meshRef}
            position={[position.x, position.y, position.z]}
            scale={[scale.x, scale.y, scale.z]}
        >
            <planeGeometry args={[1, 1, 16, 64]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={coffeeSmokeVertexShader}
                fragmentShader={coffeeSmokeFragmentShader}
                uniforms={uniforms}
                side={THREE.DoubleSide}
                transparent
                depthWrite={false}
            />
        </mesh>
    );
}

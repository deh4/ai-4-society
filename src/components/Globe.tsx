import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Generate random points for the "network mesh"
const generateParticles = (count: number) => {
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const theta = THREE.MathUtils.randFloatSpread(360);
        const phi = THREE.MathUtils.randFloatSpread(360);

        // Simple sphere distribution approximation
        const x = 2 * Math.sin(theta) * Math.cos(phi);
        const y = 2 * Math.sin(theta) * Math.sin(phi);
        const z = 2 * Math.cos(theta);

        points[i * 3] = x;
        points[i * 3 + 1] = y;
        points[i * 3 + 2] = z;
    }
    return points;
};

const particlesPosition = generateParticles(1500);

export function Globe() {
    const meshRef = useRef<THREE.Mesh>(null!);
    const pointsRef = useRef<THREE.Points>(null!);

    useFrame((_, delta) => {
        // Slowly rotate
        if (meshRef.current) {
            meshRef.current.rotation.y += delta * 0.1;
        }
        if (pointsRef.current) {
            pointsRef.current.rotation.y += delta * 0.05;
            // make it "breathe" slightly or pulse could be added here
        }
    });

    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1.0} color="#2A9DFF" />

            {/* The Wireframe Mesh */}
            <Sphere ref={meshRef} args={[2, 32, 32]}>
                <meshStandardMaterial
                    color="#1a1a1a"
                    wireframe
                    transparent
                    opacity={0.1}
                />
            </Sphere>

            {/* The "Risks" / Activity Nodes */}
            <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
                <PointMaterial
                    transparent
                    color="#FF2A2A"
                    size={0.02}
                    sizeAttenuation={true}
                    depthWrite={false}
                />
            </Points>
        </>
    );
}

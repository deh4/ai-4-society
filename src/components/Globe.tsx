import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Generate random points on sphere surface
const generateSpherePoint = (r: number) => {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
};

// Generate background static particles
const generateParticles = (count: number) => {
    const points = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const p = generateSpherePoint(2); // Radius 2
        points[i * 3] = p.x;
        points[i * 3 + 1] = p.y;
        points[i * 3 + 2] = p.z;
    }
    return points;
};

const particlesPosition = generateParticles(1500);

function SignalRipples() {
    // Number of concurrent ripples - Reduced to 10
    const count = 10;

    const ripples = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            // Slower speed: 0.2 to 0.5
            speed: 0.2 + Math.random() * 0.3,
        }));
    }, []);

    return (
        <group>
            {ripples.map((rip, i) => (
                <Ripple key={i} speed={rip.speed} delay={i * 0.5} />
            ))}
        </group>
    );
}

// Individual expanding ripple on surface (Double Ring Effect)
function Ripple({ speed, delay }: { speed: number, delay: number }) {
    const mainRef = useRef<THREE.Mesh>(null!);
    const subRef = useRef<THREE.Mesh>(null!);

    // Initial random position
    const [startPos] = useMemo(() => {
        return [generateSpherePoint(2.01)]; // Just slightly above 2.0
    }, []);

    useFrame((state) => {
        if (!mainRef.current || !subRef.current) return;

        // Add delay so they don't all start at once
        const time = state.clock.elapsedTime * speed + delay;
        const cycle = time % 1;

        // --- Logic for Main Ring ---
        // Expansion: 0 -> 1 
        // Size: Reduced max radius
        const scaleMain = cycle * 0.3; // Max scale 0.3 relative to globe

        let opacityMain = 1 - Math.pow(cycle, 1.5);
        if (opacityMain < 0) opacityMain = 0;

        // --- Logic for Sub Ring (Echo) ---
        // Lags behind slightly
        // Actually simpler: just make it smaller or scaled differently.
        const scaleSub = cycle * 0.2; // Smaller radius
        let opacitySub = (1 - Math.pow(cycle, 2)) * 0.5; // Fades faster, lower max opacity
        if (cycle < 0.05) opacitySub = 0; // Hide during reset

        // Reset position logic
        if (cycle < 0.02 && Math.random() < 0.1) {
            const newPos = generateSpherePoint(2.01);

            mainRef.current.position.copy(newPos);
            mainRef.current.lookAt(new THREE.Vector3(0, 0, 0));

            subRef.current.position.copy(newPos);
            subRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        }

        // Apply Main
        mainRef.current.scale.setScalar(scaleMain);
        (mainRef.current.material as THREE.MeshBasicMaterial).opacity = opacityMain;

        // Apply Sub
        subRef.current.scale.setScalar(scaleSub);
        (subRef.current.material as THREE.MeshBasicMaterial).opacity = opacitySub;
    });

    // Set initial orientation
    useEffect(() => {
        if (mainRef.current && subRef.current) {
            mainRef.current.position.copy(startPos);
            mainRef.current.lookAt(new THREE.Vector3(0, 0, 0));

            subRef.current.position.copy(startPos);
            subRef.current.lookAt(new THREE.Vector3(0, 0, 0));
        }
    }, [startPos]);

    return (
        <group>
            {/* Main Ring - Thin */}
            <mesh ref={mainRef}>
                <ringGeometry args={[0.9, 1.0, 32]} />
                <meshBasicMaterial
                    color="#00f0ff" // Tech Cyan
                    transparent
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            {/* Sub Ring - Fainter Echo */}
            <mesh ref={subRef}>
                <ringGeometry args={[0.9, 1.0, 32]} />
                <meshBasicMaterial
                    color="#3b82f6" // Activity Blue
                    transparent
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </group>
    );
}

export function Globe() {
    const meshRef = useRef<THREE.Mesh>(null!);
    const pointsRef = useRef<THREE.Points>(null!);

    useFrame((_, delta) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += delta * 0.1;
        }
        if (pointsRef.current) {
            pointsRef.current.rotation.y += delta * 0.05;
        }
    });

    return (
        <group rotation={[0, 0, 0.1]}>
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1.0} color="#2A9DFF" />

            <Sphere ref={meshRef} args={[2, 32, 32]}>
                <meshStandardMaterial
                    color="#1a1a1a"
                    wireframe
                    transparent
                    opacity={0.05}
                />
            </Sphere>

            <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
                <PointMaterial
                    transparent
                    color="#FF4444"
                    size={0.015}
                    sizeAttenuation={true}
                    depthWrite={false}
                    opacity={0.6}
                />
            </Points>

            <RotatingGroup>
                <SignalRipples />
            </RotatingGroup>

        </group>
    );
}

function RotatingGroup({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.05;
        }
    });
    return <group ref={groupRef}>{children}</group>;
}

import { useRef, useMemo } from 'react';
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

function SignalBlips() {
    // Number of concurrent blips
    const count = 30;

    // Store config for each blip
    const blips = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            speed: 0.5 + Math.random() * 1.5, // Random speed
        }));
    }, []);

    return (
        <group>
            {blips.map((blip, i) => (
                <Blip key={i} speed={blip.speed} />
            ))}
        </group>
    );
}

// Individual blinking blip component
function Blip({ speed }: { speed: number }) {
    const meshRef = useRef<THREE.Mesh>(null!);
    const [pos] = useMemo(() => {
        return [generateSpherePoint(2.02)]; // Start position
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;

        // Cycle: 0 to 1
        const time = state.clock.elapsedTime * speed;
        // The "activation" part of the cycle
        const cycle = time % 1;

        // Animation: Blast (0.0 -> 0.2) then Decay (0.2 -> 1.0)
        let scale = 0;
        let opacity = 0;

        if (cycle < 0.1) {
            // Rapid expand
            scale = cycle * 15; // 0 -> 1.5
            opacity = cycle * 10; // 0 -> 1
        } else {
            // Slow fade
            scale = 1.5 + (cycle - 0.1);
            opacity = 1 - (cycle - 0.1) * 1.1;
        }

        if (opacity < 0) opacity = 0;

        // Move when invisible to simulate random flashes
        if (opacity <= 0 && Math.random() < 0.05) {
            const newPos = generateSpherePoint(2.02);
            meshRef.current.position.set(newPos.x, newPos.y, newPos.z);
        }

        meshRef.current.scale.setScalar(scale * 0.03); // Base size
        (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    });

    return (
        <mesh ref={meshRef} position={pos}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial color="#00ffff" transparent />
        </mesh>
    );
}

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
        }
    });

    return (
        <group rotation={[0, 0, 0.1]}> {/* Tilted axis */}
            <ambientLight intensity={0.2} />
            <pointLight position={[10, 10, 10]} intensity={1.0} color="#2A9DFF" />

            {/* The Wireframe Mesh */}
            <Sphere ref={meshRef} args={[2, 32, 32]}>
                <meshStandardMaterial
                    color="#1a1a1a"
                    wireframe
                    transparent
                    opacity={0.05}
                />
            </Sphere>

            {/* The "Risks" / Activity Nodes */}
            <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
                <PointMaterial
                    transparent
                    color="#FF4444" // Redder for risks
                    size={0.015}
                    sizeAttenuation={true}
                    depthWrite={false}
                    opacity={0.6}
                />
            </Points>

            <RotatingGroup>
                <SignalBlips />
            </RotatingGroup>

        </group>
    );
}

function RotatingGroup({ children }: { children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null!);
    useFrame((_, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.05; // Match points rotation
        }
    });
    return <group ref={groupRef}>{children}</group>;
}

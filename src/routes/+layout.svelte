<script>
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>Product Portal</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}

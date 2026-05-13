-- Allow founders/admins to delete node installations
CREATE POLICY "Admins can delete installations"
ON public.node_installations
FOR DELETE
USING (has_role(auth.uid(), 'founder'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Allow users to delete their own installations
CREATE POLICY "Users can delete their own installations"
ON public.node_installations
FOR DELETE
USING (auth.uid() = user_id);